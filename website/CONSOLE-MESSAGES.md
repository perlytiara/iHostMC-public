# Console messages you can ignore (website)

When running the website locally (`npm run dev`), you may see these in the browser console. They are **not from the iHostMC app** and can be ignored.

| Message | Cause |
| --------|--------|
| `Error in parsing value for '-webkit-text-size-adjust'. Declaration dropped` | Browser’s internal stylesheet (e.g. Firefox `layout.css`). |
| `Unknown property '-moz-osx-font-smoothing'. Declaration dropped` | Same: browser internal CSS. |
| `Source map error: installHook.js.map` / `react_devtools_backend_compact.js.map` | React DevTools (or similar) extension trying to load source maps. |
| `JSON.parse: unexpected character at line 1 column 1` (with no stack in our code) | Often from an extension or a failed request; our fetch code uses safe parsing. |

To reduce noise: disable React DevTools (or other extensions) for localhost, or filter these messages in the console.
