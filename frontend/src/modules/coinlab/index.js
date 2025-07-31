// frontend/src/modules/coinlab/index.js
import React from "react";
import { Routes, Route } from "react-router-dom";
import CoinLabMainPage from "./pages/CoinLabMainPage";
import CoinLabRunPage from "./pages/CoinLabRunPage";
import CoinLabStrategyPage from "./pages/CoinLabStrategyPage";
import CoinlabPage from './pages/CoinlabPage';
import HTSDashboardPage from './pages/HTSDashboardPage';

export default function CoinlabRouter() {
  return (
    <Routes>
      <Route index element={<CoinLabMainPage />} />
      <Route path="run" element={<CoinLabRunPage />} />
      <Route path="strategy" element={<CoinLabStrategyPage />} />
      <Route path="/coinlab" element={<CoinlabPage />} />
      <Route path="/dashboard" element={<HTSDashboardPage />} />
      {/* 추가 페이지 필요시 계속 확장 */}
    </Routes>
  );
}
