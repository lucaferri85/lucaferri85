import "@/App.css";
import "@/index.css";
import { HashRouter, Routes, Route } from "react-router-dom";
import Workspace from "@/pages/Workspace";

function App() {
  return (
    <div className="App">
      <HashRouter>
        <Routes>
          <Route path="/" element={<Workspace />} />
        </Routes>
      </HashRouter>
    </div>
  );
}

export default App;
