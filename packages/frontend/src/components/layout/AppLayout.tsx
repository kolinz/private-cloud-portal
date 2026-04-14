// packages/frontend/src/components/layout/AppLayout.tsx

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.tsx';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard',  label: 'Dashboard',    adminOnly: true  },
    { to: '/instances',  label: 'Instances',    adminOnly: false },
    { to: '/storage',    label: 'Storage',      adminOnly: false },
    { to: '/templates',  label: 'Templates',    adminOnly: true  },
    { to: '/users',      label: 'Users',        adminOnly: true  },
    { to: '/proxy',      label: 'Proxy Routes', adminOnly: true  },
  ];

  const visibleItems = navItems.filter(
    item => !item.adminOnly || user?.role === 'admin',
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* サイドバー */}
      <aside className="w-48 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col">
        {/* ロゴ */}
        <div className="px-5 py-4 border-b border-slate-100">
          <p className="text-sm font-bold text-slate-800 leading-tight">Private Cloud</p>
          <p className="text-xs text-blue-600 font-semibold">Portal</p>
        </div>

        {/* ナビ */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {visibleItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block px-5 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-600 font-semibold border-r-2 border-blue-600'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* フッター */}
        <div className="px-4 py-3 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-700 truncate">{user?.username}</p>
          <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
          <button
            onClick={handleLogout}
            className="mt-2 w-full text-xs text-slate-500 hover:text-red-600 text-left transition-colors"
          >
            ログアウト
          </button>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
