import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { SyncStatus } from '../../api/adminClient'
import { adminGetSyncStatus, adminTriggerSync } from '../../api/adminClient'
import { useToast } from '../../contexts/ToastContext'

export default function AdminSync() {
  const { toast } = useToast()
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [polling, setPolling] = useState(false)

  const load = async () => {
    const r = await adminGetSyncStatus()
    setStatus(r.data)
    return r.data
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!polling) return
    const t = setInterval(async () => {
      const s = await load()
      if (!s.running) { setPolling(false); toast('Синхронизация завершена') }
    }, 2000)
    return () => clearInterval(t)
  }, [polling])

  const trigger = async () => {
    try {
      const r = await adminTriggerSync()
      setStatus(r.data)
      setPolling(true)
      toast('Синхронизация запущена', 'info')
    } catch { toast('Не удалось запустить синхронизацию', 'error') }
  }

  const running = status?.running || polling

  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-xl font-bold text-white mb-6">Синхронизация с Dolibarr</h1>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-4">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-white font-semibold">Синхронизация товаров</p>
            <p className="text-gray-500 text-sm mt-1">
              Загружает товары, цены и остатки из Dolibarr ERP на bollente.uz
            </p>
          </div>
          <button
            onClick={trigger}
            disabled={running}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0"
          >
            <RefreshCw size={15} className={running ? 'animate-spin' : ''} />
            {running ? 'Идёт...' : 'Запустить'}
          </button>
        </div>

        {running && (
          <div className="flex items-center gap-3 py-3 px-4 bg-blue-500/10 rounded-xl text-blue-400 text-sm mb-4">
            <RefreshCw size={14} className="animate-spin shrink-0" />
            Синхронизация выполняется, подождите...
          </div>
        )}

        {status?.last_run && (
          <div className="border-t border-gray-800 pt-5">
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                status.last_success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
              }`}>
                {status.last_success ? '✓ Успешно' : '✕ Ошибка'}
              </span>
              <span className="text-xs text-gray-500">{status.last_run}</span>
            </div>

            {status.last_result && (
              <pre className="bg-gray-950 rounded-xl p-4 text-xs text-gray-400 overflow-auto max-h-48 leading-relaxed">
                {status.last_result}
              </pre>
            )}
          </div>
        )}

        {!status?.last_run && !running && (
          <p className="text-gray-600 text-sm">Ручная синхронизация ещё не запускалась.</p>
        )}
      </div>

      <div className="bg-gray-900/40 rounded-xl border border-gray-800 p-4 text-sm">
        <p className="font-medium text-gray-400 mb-1">Автоматическая синхронизация</p>
        <p className="text-gray-600">Запускается автоматически каждые 30 минут через cron.</p>
        <p className="text-gray-600 mt-1">Используйте ручной запуск только для срочного обновления данных.</p>
      </div>
    </div>
  )
}
