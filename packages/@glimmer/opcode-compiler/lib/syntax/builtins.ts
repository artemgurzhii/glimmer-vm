import {
  MachineOp,
  Op,
  StatementCompileActions,
  MacroBlocks,
  MacroInlines,
} from '@glimmer/interfaces';
import { InvokeStaticBlock, InvokeStaticBlockWithStack } from '../opcode-builder/helpers/blocks';
import { assert, unwrap } from '@glimmer/util';
import { $sp, $fp } from '@glimmer/vm';
import { op, error } from '../opcode-builder/encoder';
import {
  InvokeDynamicComponent,
  StaticComponentHelper,
} from '../opcode-builder/helpers/components';
import { Replayable, ReplayableIf } from '../opcode-builder/helpers/conditional';
import { CompilePositional } from '../opcode-builder/helpers/shared';
import { DynamicScope, PushPrimitiveReference } from '../opcode-builder/helpers/vm';
import { label } from '../opcode-builder/operands';
import { EMPTY_BLOCKS } from '../utils';
import { isHandled, NONE, UNHANDLED } from './concat';

export function populateBuiltins(
  blocks: MacroBlocks,
  inlines: MacroInlines
): { blocks: MacroBlocks; inlines: MacroInlines } {
  blocks.add('if', (params, _hash, blocks) => {
    if (!params || params.length !== 1) {
      throw new Error(`SYNTAX ERROR: #if requires a single argument`);
    }

    return ReplayableIf({
      args() {
        return {
          count: 1,
          actions: [op('Expr', params[0]), op(Op.ToBoolean)],
        };
      },

      ifTrue() {
        return InvokeStaticBlock(unwrap(blocks.get('default')));
      },

      ifFalse() {
        if (blocks.has('else')) {
          return InvokeStaticBlock(blocks.get('else')!);
        } else {
          return NONE;
        }
      },
    });
  });

  blocks.add('unless', (params, _hash, blocks) => {
    if (!params || params.length !== 1) {
      throw new Error(`SYNTAX ERROR: #unless requires a single argument`);
    }

    return ReplayableIf({
      args() {
        return {
          count: 1,
          actions: [op('Expr', params[0]), op(Op.ToBoolean)],
        };
      },

      ifTrue() {
        if (blocks.has('else')) {
          return InvokeStaticBlock(blocks.get('else')!);
        } else {
          return NONE;
        }
      },

      ifFalse() {
        return InvokeStaticBlock(unwrap(blocks.get('default')));
      },
    });
  });

  blocks.add('with', (params, _hash, blocks) => {
    if (!params || params.length !== 1) {
      throw new Error(`SYNTAX ERROR: #with requires a single argument`);
    }

    return ReplayableIf({
      args() {
        return {
          count: 2,
          actions: [op('Expr', params[0]), op(Op.Dup, $sp, 0), op(Op.ToBoolean)],
        };
      },

      ifTrue() {
        return InvokeStaticBlockWithStack(unwrap(blocks.get('default')), 1);
      },

      ifFalse() {
        if (blocks.has('else')) {
          return InvokeStaticBlock(blocks.get('else')!);
        } else {
          return NONE;
        }
      },
    });
  });

  blocks.add('let', (params, _hash, blocks) => {
    if (!params) {
      return error('let requires arguments', 0, 0);
    }

    let { count, actions } = CompilePositional(params);
    return [actions, InvokeStaticBlockWithStack(blocks.get('default')!, count)];
  });

  blocks.add('each', (params, hash, blocks) => {
    return Replayable({
      args() {
        let actions: StatementCompileActions;

        if (hash && hash[0][0] === 'key') {
          actions = [op('Expr', hash[1][0])];
        } else {
          actions = [PushPrimitiveReference(null)];
        }

        actions.push(op('Expr', params[0]));

        return { count: 2, actions };
      },

      body() {
        let out: StatementCompileActions = [
          op(Op.EnterList, label('BODY'), label('ELSE')),
          op(MachineOp.PushFrame),
          op(Op.Dup, $fp, 1),
          op(MachineOp.ReturnTo, label('ITER')),
          op('Label', 'ITER'),
          op(Op.Iterate, label('BREAK')),
          op('Label', 'BODY'),
          InvokeStaticBlockWithStack(unwrap(blocks.get('default')), 2),
          op(Op.Pop, 2),
          op(MachineOp.Jump, label('FINALLY')),
          op('Label', 'BREAK'),
          op(MachineOp.PopFrame),
          op(Op.ExitList),
          op(MachineOp.Jump, label('FINALLY')),
          op('Label', 'ELSE'),
        ];

        if (blocks.has('else')) {
          out.push(InvokeStaticBlock(blocks.get('else')!));
        }

        return out;
      },
    });
  });

  blocks.add('in-element', (params, hash, blocks) => {
    if (!params || params.length !== 1) {
      throw new Error(`SYNTAX ERROR: #in-element requires a single argument`);
    }

    return ReplayableIf({
      args() {
        assert(hash !== null, '[BUG] `{{#in-element}}` should have non-empty hash');

        let [keys, values] = hash!;

        let actions: StatementCompileActions = [];

        for (let i = 0; i < keys.length; i++) {
          let key = keys[i];
          if (key === 'guid' || key === 'insertBefore') {
            actions.push(op('Expr', values[i]));
          } else {
            throw new Error(`SYNTAX ERROR: #in-element does not take a \`${keys[0]}\` option`);
          }
        }

        actions.push(op('Expr', params[0]), op(Op.Dup, $sp, 0));

        return { count: 4, actions };
      },

      ifTrue() {
        return [
          op(Op.PushRemoteElement),
          InvokeStaticBlock(unwrap(blocks.get('default'))),
          op(Op.PopRemoteElement),
        ];
      },
    });
  });

  blocks.add('-with-dynamic-vars', (_params, hash, blocks) => {
    if (hash) {
      let [names, expressions] = hash;

      let { actions } = CompilePositional(expressions);

      return [
        actions,
        DynamicScope(names, () => {
          return InvokeStaticBlock(unwrap(blocks.get('default')));
        }),
      ];
    } else {
      return InvokeStaticBlock(unwrap(blocks.get('default')));
    }
  });

  blocks.add('component', (_params, hash, blocks, context) => {
    assert(_params && _params.length, 'SYNTAX ERROR: #component requires at least one argument');

    let tag = _params[0];
    if (typeof tag === 'string') {
      let returned = StaticComponentHelper(
        context,
        _params[0] as string,
        hash,
        blocks.get('default')
      );

      if (isHandled(returned)) return returned;
    }

    let [definition, ...params] = _params!;

    return op('DynamicComponent', {
      definition,
      attrs: null,
      params,
      args: hash,
      atNames: false,
      blocks,
      curried: false,
    });
  });

  inlines.add('component', (_name, _params, hash, context) => {
    assert(
      _params && _params.length,
      'SYNTAX ERROR: component helper requires at least one argument'
    );

    let tag = _params && _params[0];
    if (typeof tag === 'string') {
      let returned = StaticComponentHelper(context, tag as string, hash, null);
      if (returned !== UNHANDLED) return returned;
    }

    let [definition, ...params] = _params!;
    return InvokeDynamicComponent(context.meta, {
      definition,
      attrs: null,
      params,
      hash,
      atNames: false,
      blocks: EMPTY_BLOCKS,
      curried: false,
    });
  });

  return { blocks, inlines };
}
