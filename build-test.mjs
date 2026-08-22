// Gera /tmp/gs.mjs, o bundle de services/geminiService.ts usado pelos
// testes (com Firebase substituído por um stub). Rodado automaticamente
// por test-fixes.mjs — não precisa chamar à mão.
import * as esbuild from 'esbuild';
const stub = {
  name: 'stub-firebase',
  setup(build) {
    build.onResolve({ filter: /\.\/firebase$/ }, () => ({ path: 'stubfb', namespace: 'stub' }));
    build.onResolve({ filter: /^firebase\// }, () => ({ path: 'stubsdk', namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: `export const db={}; export const auth={currentUser:null}; export const storage={};
        export const doc=()=>({}); export const getDoc=async()=>({exists:()=>false}); export const deleteDoc=async()=>{};`,
      loader: 'js',
    }));
  },
};
await esbuild.build({
  entryPoints: ['services/geminiService.ts'],
  bundle: true, format: 'esm', platform: 'node',
  outfile: '/tmp/gs.mjs', plugins: [stub], logLevel: 'error',
  define: { 'import.meta.env.DEV': 'false' },
});
