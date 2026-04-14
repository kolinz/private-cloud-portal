// packages/frontend/src/pages/OnboardingPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client.ts';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    systemName:    '',
    adminUsername: '',
    adminPassword: '',
    confirmPassword: '',
  });
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.systemName.trim())
      e.systemName = 'システム名を入力してください';
    if (!/^[a-zA-Z0-9_]+$/.test(form.adminUsername))
      e.adminUsername = '英数字とアンダースコアのみ使用可';
    if (form.adminUsername.length < 3)
      e.adminUsername = '3文字以上で入力してください';
    if (form.adminPassword.length < 8)
      e.adminPassword = '8文字以上で入力してください';
    if (form.adminPassword !== form.confirmPassword)
      e.confirmPassword = 'パスワードが一致しません';
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    setApiError('');
    try {
      await api.onboarding.setup({
        systemName:    form.systemName,
        adminUsername: form.adminUsername,
        adminPassword: form.adminPassword,
      });
      navigate('/login', { state: { setupComplete: true } });
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : 'セットアップに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const field = (key: keyof typeof form) => ({
    value:    form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value })),
  });

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* ロゴ */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <span className="text-white text-sm font-bold">PCP</span>
          </div>
          <span className="text-xl font-semibold text-slate-700">Private Cloud Portal</span>
        </div>

        {/* カード */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <h1 className="text-lg font-semibold text-slate-800 mb-1">初期セットアップ</h1>
          <p className="text-sm text-slate-500 mb-6">
            ポータルの基本設定と管理者アカウントを作成します。
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* システム名 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                システム名
              </label>
              <input
                type="text"
                {...field('systemName')}
                placeholder="My Private Cloud"
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.systemName ? 'border-red-300 bg-red-50' : 'border-slate-300'
                }`}
              />
              {errors.systemName && (
                <p className="mt-1 text-xs text-red-500">{errors.systemName}</p>
              )}
            </div>

            {/* 管理者ユーザー名 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                管理者ユーザー名
              </label>
              <input
                type="text"
                {...field('adminUsername')}
                placeholder="admin"
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.adminUsername ? 'border-red-300 bg-red-50' : 'border-slate-300'
                }`}
              />
              {errors.adminUsername && (
                <p className="mt-1 text-xs text-red-500">{errors.adminUsername}</p>
              )}
            </div>

            {/* 管理者パスワード */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                管理者パスワード
              </label>
              <input
                type="password"
                {...field('adminPassword')}
                placeholder="••••••••"
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.adminPassword ? 'border-red-300 bg-red-50' : 'border-slate-300'
                }`}
              />
              {errors.adminPassword && (
                <p className="mt-1 text-xs text-red-500">{errors.adminPassword}</p>
              )}
            </div>

            {/* パスワード確認 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                パスワード確認
              </label>
              <input
                type="password"
                {...field('confirmPassword')}
                placeholder="••••••••"
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.confirmPassword ? 'border-red-300 bg-red-50' : 'border-slate-300'
                }`}
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-red-500">{errors.confirmPassword}</p>
              )}
            </div>

            {apiError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {apiError}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 mt-2"
            >
              {loading ? 'セットアップ中...' : 'セットアップを完了する'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
