/// <reference types="vite/client" />

// Bridge R3F JSX intrinsics from the legacy global JSX namespace into the
// React 19 / react-jsx module namespace that TypeScript 5 uses.
// R3F v8 augments the global JSX.IntrinsicElements (old pattern); with
// "jsx": "react-jsx" TypeScript looks at React.JSX.IntrinsicElements instead.
// This re-export makes tsc aware of Three.js JSX elements (mesh, group, etc.)
// without changing jsx transform settings.
import type { ThreeElements } from '@react-three/fiber';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}
