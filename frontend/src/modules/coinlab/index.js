// frontend/src/modules/coinlab/index.js
import React from "react";
import { Routes, Route } from "react-router-dom";
import CoinLabMainPage from "./pages/CoinLabMainPage";
import CoinLabRunPage from "./pages/CoinLabRunPage";
import CoinLabStrategyPage from "./pages/CoinLabStrategyPage";
import CoinlabPage from './pages/CoinlabPage';
import HTSDashboardPage from './pages/HTSDashboardPage';
import ConditionSearchPage from "./pages/ConditionSearchPage";
import CoinDataManagerPage from "./pages/CoinDataManagerPage";
import Watchlist from "./pages/Watchlist";

export default function CoinlabRouter() {
  return (
    <Routes>
      <Route index element={<CoinLabMainPage />} />
      <Route path="run" element={<CoinLabRunPage />} />
      <Route path="strategy" element={<CoinLabStrategyPage />} />
      <Route path="coinlab" element={<CoinlabPage />} />
      <Route path="dashboard" element={<HTSDashboardPage />} />
      <Route path="condition_search" element={<ConditionSearchPage />} />
      <Route path="coin_data_manager" element={<CoinDataManagerPage />} />
      <Route path="watchlist" element={<Watchlist />} />
      {/* 추가 페이지 필요시 계속 확장 */}
    </Routes>
  );
}
