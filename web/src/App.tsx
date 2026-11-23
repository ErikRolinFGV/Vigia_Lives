import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout, Protegido } from "./components/AppLayout";
import { Login } from "./pages/Login";
import { Inicio } from "./pages/Inicio";
import { Acervo } from "./pages/Acervo";
import { NoAr } from "./pages/NoAr";
import { Canais } from "./pages/Canais";
import { CanalPagina } from "./pages/Canal";
import { LivePagina } from "./pages/live/LivePagina";
import { Replay } from "./pages/live/AoVivo";
import { Publico } from "./pages/Publico";
import { Comparar } from "./pages/Comparar";
import { Registro } from "./pages/Registro";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/r/:canal/:slug" element={<Publico />} />
      {/* a escolha de plataforma virou campo de "Acompanhar canal" */}
      <Route path="/plataformas" element={<Navigate to="/yt/inicio" replace />} />
      <Route path="/yt" element={<Protegido><AppLayout /></Protegido>}>
        <Route index element={<Navigate to="inicio" replace />} />
        <Route path="inicio" element={<Inicio />} />
        <Route path="acervo" element={<Acervo />} />
        <Route path="aovivo" element={<NoAr />} />
        <Route path="canais" element={<Canais />} />
        <Route path="canais/:id" element={<CanalPagina />} />
        <Route path="lives/:id" element={<LivePagina />} />
        <Route path="lives/:id/replay" element={<Replay />} />
        <Route path="comparar" element={<Comparar />} />
        <Route path="registro" element={<Registro />} />
      </Route>
      <Route path="*" element={<Navigate to="/yt/inicio" replace />} />
    </Routes>
  );
}
