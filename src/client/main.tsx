import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Home } from "./Home";
import { RoomPage } from "./RoomPage";
import "./styles.css";

const ROOM_PATH = /^\/r\/([^/]+)\/?$/;

function App() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const m = ROOM_PATH.exec(path);
  return m ? <RoomPage key={m[1]} roomId={decodeURIComponent(m[1])} /> : <Home />;
}

createRoot(document.getElementById("root")!).render(<App />);
