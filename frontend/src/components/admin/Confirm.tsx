import { useCallback, useState } from 'react'

export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean
    message: string
    resolve: ((v: boolean) => void) | null
  }>({ open: false, message: '', resolve: null })

  const confirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => setState({ open: true, message, resolve }))
  }, [])

  const answer = (v: boolean) => {
    state.resolve?.(v)
    setState({ open: false, message: '', resolve: null })
  }

  const ConfirmModal = state.open ? (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full border border-gray-700 shadow-2xl">
        <p className="text-white text-sm mb-6 leading-relaxed">{state.message}</p>
        <div className="flex gap-3">
          <button
            onClick={() => answer(false)}
            className="flex-1 px-4 py-2.5 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 text-sm font-medium transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={() => answer(true)}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
          >
            Подтвердить
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { confirm, ConfirmModal }
}
