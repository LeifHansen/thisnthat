// Ambient declarations for CSS imports used by the web target. Metro/Babel
// resolve these at bundle time; this lets `tsc --noEmit` resolve them too,
// instead of erroring on the missing module type.
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.css';
