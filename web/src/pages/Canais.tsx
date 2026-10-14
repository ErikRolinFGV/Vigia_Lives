import { useCrumbs } from "../components/AppLayout";

// Etapa 0: só o contêiner. A lista de canais vigiados entra na etapa 1.
export function Canais() {
  useCrumbs([]);
  return (
    <div className="view-in" style={{ width: "100%", maxWidth: 1180, margin: "0 auto", padding: "34px 24px 72px" }}>
      <h1 style={{ fontFamily: "Figtree, sans-serif", fontSize: 30, fontWeight: 800, letterSpacing: "-.025em", margin: 0 }}>Canais vigiados</h1>
    </div>
  );
}
