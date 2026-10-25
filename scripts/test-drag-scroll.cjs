const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../components/ios/DragScroll.tsx"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const compiled = { exports: {} };
new Function("require", "module", "exports", code)(
  (id) => id === "react" ? { useRef: (current) => ({ current }) } : require(id), compiled, compiled.exports
);

function fixture() {
  const captured = new Set();
  const row = {
    scrollLeft: 100, scrollWidth: 900, clientWidth: 320,
    style: { scrollSnapType: "x mandatory", scrollBehavior: "smooth" }, dataset: {},
    setPointerCapture: (id) => captured.add(id),
    hasPointerCapture: (id) => captured.has(id), releasePointerCapture: (id) => captured.delete(id),
  };
  const { props } = compiled.exports.DragScroll({ children: [], "aria-label": "Tools" });
  const event = (overrides = {}) => ({
    currentTarget: row, pointerId: 1, pointerType: "mouse", isPrimary: true,
    button: 0, buttons: 1, clientX: 200, detail: 1, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; },
    ...overrides,
  });
  return { row, props, event, captured };
}

{
  const { props, row, event, captured } = fixture();
  props.onPointerDown(event()); props.onPointerMove(event({ clientX: 197 })); props.onPointerUp(event());
  const click = event(); props.onClickCapture(click);
  assert.equal(row.scrollLeft, 100); assert.equal(captured.size, 0); assert(!click.prevented);
  console.log("PASS: normal clicks and small pointer movements still activate cards and tools");
}
{
  const { props, row, event, captured } = fixture();
  props.onPointerDown(event());
  const move = event({ clientX: 140 }); props.onPointerMove(move);
  assert.equal(row.scrollLeft, 160); assert.equal(row.style.scrollSnapType, "none");
  assert.equal(row.style.scrollBehavior, "auto"); assert(captured.has(1)); assert(move.prevented);
  props.onPointerUp(event({ clientX: 140 }));
  assert.equal(row.style.scrollSnapType, "x mandatory"); assert.equal(row.style.scrollBehavior, "smooth");
  assert.equal(captured.size, 0); assert.equal(row.dataset.dragging, undefined);
  const click = event(); props.onClickCapture(click); assert(click.prevented && click.stopped);
  props.onPointerDown(event()); props.onPointerUp(event());
  const nextClick = event(); props.onClickCapture(nextClick); assert(!nextClick.prevented);
  console.log("PASS: mouse dragging scrolls, restores date snapping, suppresses accidental opening, and allows the next click");
}
for (const pointerType of ["touch", "pen"]) {
  const { props, row, event } = fixture();
  props.onPointerDown(event({ pointerType }));
  const move = event({ pointerType, clientX: 100 }); props.onPointerMove(move);
  assert.equal(row.scrollLeft, 100); assert(!move.prevented);
}
{
  const { props, row, event } = fixture();
  props.onPointerDown(event()); props.onPointerMove(event({ clientX: 140 }));
  props.onPointerCancel(event()); assert.equal(row.style.scrollSnapType, "x mandatory");
  const keyboardClick = event({ detail: 0 }); props.onClickCapture(keyboardClick); assert(!keyboardClick.prevented);
  const nativeDrag = event(); props.onDragStart(nativeDrag); assert(nativeDrag.prevented);
}
{
  const { props, row, event } = fixture(); row.scrollWidth = 200;
  props.onPointerDown(event()); props.onPointerMove(event({ clientX: 100 }));
  const click = event(); props.onClickCapture(click); assert(!click.prevented); assert.equal(row.scrollLeft, 100);
}
console.log("PASS: touch and keyboard behavior, cancellation, native link drag prevention, and lists without overflow");
