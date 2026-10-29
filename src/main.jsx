import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Monta la aplicación React dentro del elemento raíz definido en index.html.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);