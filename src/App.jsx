import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppProvider';
import { ToastProvider } from './components/Toast';
import { HelmetProvider } from 'react-helmet-async';
import ErrorBoundary from './components/ErrorBoundary';
import ScrollToTop from './components/ScrollToTop';
import LoadingSpinner from './components/LoadingSpinner';
import Navbar from './components/Navbar';
import ChatWidget from './components/ChatWidget/ChatWidget';

import KROrderHomePage from './pages/KROrderHomePage';

// Lazy load pages for code-splitting
const LoginPage = lazy(() => import('./pages/LoginPage'));
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'));
const AdminLoginPage = lazy(() => import('./pages/AdminLoginPage'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const CartPage = lazy(() => import('./pages/CartPage'));
const PaymentPage = lazy(() => import('./pages/PaymentPage'));
const PolicyPage = lazy(() => import('./pages/PolicyPage'));

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <ToastProvider>
          <HelmetProvider>
            <BrowserRouter>
            <ScrollToTop />
            <ChatWidget />
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                {/* Trang chủ & Aliases */}
                <Route path="/" element={<KROrderHomePage />} />
                <Route path="/home" element={<KROrderHomePage />} />
                <Route path="/products" element={<KROrderHomePage />} />
                <Route path="/catalog" element={<KROrderHomePage />} />
                <Route path="/kr-order" element={<KROrderHomePage />} />

                {/* Khách hàng & Mua hàng */}
                <Route path="/cart" element={<><Navbar /><CartPage /></>} />
                <Route path="/gio-hang" element={<><Navbar /><CartPage /></>} />
                <Route path="/checkout" element={<><Navbar /><CartPage /></>} />
                <Route path="/login" element={<><Navbar /><LoginPage /></>} />
                <Route path="/dang-nhap" element={<><Navbar /><LoginPage /></>} />
                <Route path="/orders" element={<><Navbar /><OrdersPage /></>} />
                <Route path="/order" element={<><Navbar /><OrdersPage /></>} />
                <Route path="/don-hang" element={<><Navbar /><OrdersPage /></>} />
                <Route path="/tra-cuu" element={<><Navbar /><OrdersPage /></>} />
                <Route path="/tracking" element={<><Navbar /><OrdersPage /></>} />
                <Route path="/profile" element={<><Navbar /><UserProfilePage /></>} />
                <Route path="/tai-khoan" element={<><Navbar /><UserProfilePage /></>} />
                <Route path="/payment/:orderId" element={<><Navbar /><PaymentPage /></>} />
                <Route path="/thanh-toan/:orderId" element={<><Navbar /><PaymentPage /></>} />
                <Route path="/policy" element={<><Navbar /><PolicyPage /></>} />
                <Route path="/chinh-sach" element={<><Navbar /><PolicyPage /></>} />

                {/* Admin & Quản trị */}
                <Route path="/admin/login" element={<AdminLoginPage />} />
                <Route path="/admin" element={<AdminDashboardPage />} />
                <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
                <Route path="/admin/overview" element={<AdminDashboardPage />} />
                <Route path="/admin/products" element={<AdminDashboardPage />} />
                <Route path="/admin/catalog" element={<AdminDashboardPage />} />
                <Route path="/admin/sourcing" element={<AdminDashboardPage />} />
                <Route path="/admin/pending" element={<AdminDashboardPage />} />
                <Route path="/admin/orders" element={<AdminDashboardPage />} />
                <Route path="/admin/users" element={<AdminDashboardPage />} />
                <Route path="/admin/customers" element={<AdminDashboardPage />} />
                <Route path="/admin/settings" element={<AdminDashboardPage />} />
                <Route path="/admin/rates" element={<AdminDashboardPage />} />
                <Route path="/admin/*" element={<AdminDashboardPage />} />

                {/* Catch-all 404 */}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          </HelmetProvider>
        </ToastProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}
