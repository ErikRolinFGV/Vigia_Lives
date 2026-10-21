import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout, Protegido } from "./components/AppLayout";
import { Login, Recuperar } from "./pages/Login";
import { Plataformas } from "./pages/Plataformas";
import { Canais } from "./pages/Canais";
import { CanalPagina } from "./pages/Canal";
import { LivePagina } from "./pages/live/LivePagina";
import { Replay } from "./pages/live/AoVivo";
import { Publico } from "./pages/Publico";
import { Comparar } from "./pages/Comparar";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/recuperar" element={<Recuperar />} />
      <Route path="/r/:canal/:slug" element={<Publico />} />
      <Route path="/plataformas" element={<Protegido><Plataformas /></Protegido>} />
      <Route path="/yt" element={<Protegido><AppLayout /></Protegido>}>
        <Route index element={<Navigate to="canais" replace />} />
        <Route path="canais" element={<Canais />} />
        <Route path="canais/:id" element={<CanalPagina />} />
        <Route path="lives/:id" element={<LivePagina />} />
        <Route path="lives/:id/replay" element={<Replay />} />
        <Route path="comparar" element={<Comparar />} />
      </Route>
      <Route path="*" element={<Navigate to="/yt/canais" replace />} />
    </Routes>
  );
}
