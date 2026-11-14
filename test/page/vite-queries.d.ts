// The two Vite import queries assets.test.ts uses: "?raw" is a file's text, "?inline" a base64 data URI.
declare module "*?raw" {
  const text: string;
  export default text;
}
declare module "*?inline" {
  const dataUri: string;
  export default dataUri;
}
