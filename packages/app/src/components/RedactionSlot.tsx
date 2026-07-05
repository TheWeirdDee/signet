/**
 * The debossed redaction slot — the signature element. The ink cover lifts
 * (translateY) when `open` flips true; the value sits debossed underneath.
 */
export function RedactionSlot({ value, open }: { value: string; open: boolean }) {
  return (
    <div className={`slot${open ? " open" : ""}`}>
      <div className="val">{value}</div>
      <div className="cover" aria-hidden={open}>
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
