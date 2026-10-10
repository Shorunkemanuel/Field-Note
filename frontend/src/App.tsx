import { Route, Routes } from "react-router-dom";
import SiteHeader from "./components/SiteHeader";
import CaptureObservationPage from "./pages/CaptureObservationPage";
import NewObservationPage from "./pages/NewObservationPage";
import ObservationDetailPage from "./pages/ObservationDetailPage";
import ObservationsPage from "./pages/ObservationsPage";

export default function App() {
  return (
    <>
      <SiteHeader />
      <Routes>
        <Route path="/" element={<ObservationsPage />} />
        <Route path="/capture" element={<CaptureObservationPage />} />
        <Route path="/observations/new" element={<NewObservationPage />} />
        <Route path="/observations/:id" element={<ObservationDetailPage />} />
      </Routes>
      <footer className="site-footer">AI proposes. Evidence proves. Humans verify.</footer>
    </>
  );
}
