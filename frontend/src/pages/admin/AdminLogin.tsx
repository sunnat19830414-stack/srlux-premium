import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminCheckAuth, setAdminKey } from '../../api/adminClient'

export default function AdminLogin() {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!key.trim()) return
    setLoading(true)
    setError('')
    setAdminKey(key.trim())
    try {
      await adminCheckAuth()
      navigate('/admin/orders')
    } catch {
      setError('Неверный ключ доступа')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">SR Lux</h1>
          <p className="text-gray-400 mt-1">Панель управления</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <label className="block text-sm text-gray-400 mb-2">Ключ доступа</label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Введите ADMIN_API_KEY"
            className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 text-sm border border-gray-700 focus:outline-none focus:border-amber-500 mb-4"
            autoFocus
          />
          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold rounded-lg py-3 text-sm transition-colors"
          >
            {loading ? 'Проверяю...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
