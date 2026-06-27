/**
 * Ambient canvas. Two soft gold glows and a faint grain sit behind every
 * section to give the ink depth instead of a flat black wall. Fixed, behind
 * content (-z-10 inside the isolated main), and inert to pointer events.
 */
export function Ambient() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* warm glow, upper-left */}
      <div
        className="absolute -left-40 -top-40 h-[42rem] w-[42rem] rounded-full opacity-60 blur-[120px]"
        style={{
          background:
            'radial-gradient(circle, rgba(201,154,63,0.20) 0%, rgba(201,154,63,0) 70%)',
        }}
      />
      {/* deeper glow, lower-right */}
      <div
        className="absolute -bottom-52 -right-40 h-[46rem] w-[46rem] rounded-full opacity-50 blur-[130px]"
        style={{
          background:
            'radial-gradient(circle, rgba(224,184,96,0.16) 0%, rgba(224,184,96,0) 70%)',
        }}
      />
      {/* fine grain so large dark areas never read as a flat fill */}
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
