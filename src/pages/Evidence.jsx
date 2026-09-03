import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useScopedData, useTerms } from "@/lib/ProjectContext";
import DataError from "@/components/shared/DataError";
import { useInvalidateData } from "@/lib/queries";
import { Loader2, Images, X, ExternalLink } from "lucide-react";

export default function Evidence() {
  const { floors, spaces, points, isLoading, isError } = useScopedData();
  const terms = useTerms();
  const invalidate = useInvalidateData();
  const [active, setActive] = useState(null); // { url, point, floor, space, id }

  const floorMap = useMemo(() => Object.fromEntries(floors.map((f) => [f.id, f.name])), [floors]);
  const spaceMap = useMemo(() => Object.fromEntries(spaces.map((s) => [s.id, s.name])), [spaces]);

  const photos = useMemo(() => {
    const out = [];
    for (const p of points) {
      for (const url of p.evidencia || []) {
        out.push({
          url,
          id: p.id,
          point: p.name,
          floor: floorMap[p.floor_id] || "—",
          space: spaceMap[p.space_id] || "—",
        });
      }
    }
    return out;
  }, [points, floorMap, spaceMap]);

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (isError) return <DataError onRetry={invalidate} />;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold tracking-tight flex items-center gap-2">
          <Images className="w-6 h-6 text-primary" /> Evidencia fotográfica
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{photos.length} foto{photos.length !== 1 ? "s" : ""} en el proyecto</p>
      </div>

      {photos.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Images className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Aún no hay fotos. Agrega evidencia desde el checklist de un {terms.point.toLowerCase()}.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {photos.map((ph, i) => (
            <button
              key={`${ph.id}-${i}`}
              onClick={() => setActive(ph)}
              className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted"
            >
              <img src={ph.url} alt={ph.point} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              <span className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[10px] px-1.5 py-1 text-left truncate">
                {ph.point} · {ph.floor}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {active && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setActive(null)}>
          <button onClick={() => setActive(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20">
            <X className="w-5 h-5" />
          </button>
          <div className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <img src={active.url} alt={active.point} className="max-h-[80vh] w-auto mx-auto rounded-lg" />
            <div className="mt-3 flex items-center justify-between gap-3 text-white">
              <div className="min-w-0">
                <p className="font-medium truncate">{active.point}</p>
                <p className="text-xs text-white/70 truncate">{active.floor} · {active.space}</p>
              </div>
              <Link to={`/checklist/${active.id}`} className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 flex-shrink-0">
                <ExternalLink className="w-4 h-4" /> Abrir punto
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
