/**
 * chromeless モードのクエリパラメータ読み書き (ADR 0039)。
 *
 * BlobView / WorktreeBlobView で共有する。
 */

import { type ComputedRef, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

interface UseChromelessReturn {
  readonly isChromeless: ComputedRef<boolean>
  toggleChromeless: () => void
}

export function useChromeless(): UseChromelessReturn {
  const route = useRoute()
  const router = useRouter()

  const isChromeless = computed(() => route.query.chromeless === '1')

  function toggleChromeless(): void {
    const query = { ...route.query }
    if (query.chromeless === '1') {
      delete query.chromeless
    } else {
      query.chromeless = '1'
    }
    void router.replace({ path: route.path, query })
  }

  return { isChromeless, toggleChromeless }
}
