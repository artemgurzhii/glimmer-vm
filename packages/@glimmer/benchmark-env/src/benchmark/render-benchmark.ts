import { SimpleElement } from '@simple-dom/interface';
import {
  Dict,
  RuntimeResolver,
  SyntaxCompilationContext,
  ComponentDefinition,
  CompilableProgram,
  RuntimeArtifacts,
} from '@glimmer/interfaces';
import { createConstRef, Reference, childRefFor } from '@glimmer/reference';
import { NewElementBuilder, runtimeContext, renderComponent, renderSync } from '@glimmer/runtime';

import createEnvDelegate, { registerResult } from './create-env-delegate';
import { measureRender } from './util';
import { UpdateBenchmark } from '../interfaces';

export default async function renderBenchmark(
  artifacts: RuntimeArtifacts,
  context: SyntaxCompilationContext,
  runtimeResolver: RuntimeResolver,
  component: ComponentDefinition,
  layout: CompilableProgram,
  root: Dict,
  element: SimpleElement,
  isInteractive = true
): Promise<UpdateBenchmark> {
  let resolveRender: (() => void) | undefined;

  await measureRender('render', 'renderStart', 'renderEnd', () => {
    const document = element.ownerDocument;
    const envDelegate = createEnvDelegate(isInteractive);
    const runtime = runtimeContext(
      {
        document,
      },
      envDelegate,
      artifacts,
      runtimeResolver
    );
    const env = runtime.env;
    const cursor = { element, nextSibling: null };
    const treeBuilder = NewElementBuilder.forInitialRender(env, cursor);
    const rootRef = createConstRef(root, 'this');

    const args: Dict<Reference> = {};
    for (const key of Object.keys(root)) {
      args[key] = childRefFor(rootRef, key);
    }

    const result = renderSync(
      env,
      renderComponent(runtime, treeBuilder, context, component, layout, args)
    );

    registerResult(result, () => {
      if (resolveRender !== undefined) {
        resolveRender();
        resolveRender = undefined;
      }
    });
  });

  performance.measure('load', 'navigationStart', 'renderStart');

  return async (name, update) => {
    await measureRender(
      name,
      name + 'Start',
      name + 'End',
      () =>
        new Promise((resolve) => {
          resolveRender = resolve;
          update();
        })
    );
  };
}
