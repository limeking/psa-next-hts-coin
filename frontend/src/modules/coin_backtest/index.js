import React from "react";
import { Routes, Route } from "react-router-dom";
import CoinBacktestMainPage from "./pages/CoinBacktestMainPage";
import CoinBacktestRunPage from "./pages/CoinBacktestRunPage";
import CoinDataPage from "./pages/CoinDataPage";

export default function CoinBacktestModule() {
  return (
    <Routes>
      <Route path="/" element={<CoinBacktestMainPage />} />
      <Route path="/run" element={<CoinBacktestRunPage />} />
      <Route path="/data" element={<CoinDataPage />} />
    </Routes>
  );
}
