import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { SyncStatus } from '../../api/adminClient'
import { adminGetSyncStatus, adminTriggerSync } from '../../api/adminClient'

export default function AdminSync() {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [polling, setPolling] = useState(false)

  const load = async () => {
    const r = await adminGetSyncStatus()
    setStatus(r.data)
    return r.data
  }

  useEffect(() => { load() }, [])

  // Poll while running
  useEffect(() => {
    if (!polling) return
    const timer = setInterval(async () => {
      const s = await load()
      if (!s.running) setPolling(false)
    }, 2000)
    return () => clearInterval(timer)
  }, [polling])

  const trigger = async () => {
    const r = await adminTriggerSync()
    setStatus(r.data)
    setPolling(true)
  }

  const running = status?.running || polling

  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-xl font-bold text-white mb-6">Синхронизация с Dolibarr</h1>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-white font-medium">Синхронизация товаров</p>
            <p className="text-gray-500 text-sm mt-1">
              Загружает товары, цены и остатки из Dolibarr ERP
            </p>
          </div>
          <button
            onClick={trigger}
            disabled={running}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <RefreshCw size={15} className={running ? 'animate-spin' : ''} />
            {running ? 'Идёт...' : 'Запустить'}
          </button>
        </div>

        {status?.last_run && (
          <div className="border-t border-gray-800 pt-4">
            <p className="text-xs text-gray-500 mb-1">Последний запуск: {status.last_run}</p>
            <div className={`text-xs px-2 py-1 rounded inline-block mb-2 ${
              status.last_success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
            }`}>
              {status.last_success ? '✓ Успешно' : '✗ Ошибка'}
            </div>
            {status.last_result && (
              <pre className="bg-gray-950 rounded p-3 text-xs text-gray-400 overflow-auto max-h-40 mt-1">
                {status.last_result}
              </pre>
            )}
          </div>
        )}

        {!status?.last_run && (
          <p className="text-gray-600 text-sm">Синхронизация ещё не запускалась вручную.</p>
        )}
      </div>

      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-4 text-sm text-gray-500">
        <p className="font-medium text-gray-400 mb-1">Автоматическая синхронизация</p>
        <p>Cron-задача запускается каждые 30 минут автоматически.</p>
        <p className="mt-1">Ручной запуск нужен только если нужно срочно обновить данные.</p>
      </div>
    </div>
  )
}
