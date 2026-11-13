# UI mock renders

Every screen of [`mocks/index.html`](../../mocks/index.html), rendered at iPhone 16 size (393 × 852 CSS
px at 3×, so 1179 × 2556 px) and stamped at 300 DPI. The mock's MOCK button is hidden, so the images show
only the design.

Names are `<scenario>-<NN>-<screen>.png`:

- `00-all-projects` is the overview display.
- `NN-<project>-top` and `-bottom` are each project's display, scrolled to the top and the bottom.
- `stale` and `offline` are the afternoon grayed out, so only their overview is included.

| Scenario | What it shows |
|---|---|
| `afternoon` | One of every card: red, green, two yellows, gray and done |
| `allgreen` | Everything on time |
| `keyboard` | Two projects waiting on Terry |
| `silent` | One monitoring agent stopped reporting 32 minutes ago |
| `morning` | Blocks just started; every card too early to call |
| `stale` | No agent has reported for 35 minutes |
| `offline` | The phone can't reach the board |
| `alldone` | Every block finished; header says IDLE |

Clock times in the images are when they were rendered. To regenerate after the mock changes:

    python mocks/tools/render-mock.py
