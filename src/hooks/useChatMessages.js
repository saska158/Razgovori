import { useCallback, useEffect, useRef, useState } from "react"
import { query, orderBy, limitToLast, endBefore, getDocs, onSnapshot } from "../api/firebase"

const PAGE_SIZE = 15

const getErrorMessage = (error) => {
    if (error.code === "permission-denied") return "You don't have permission to access this data."
    if (error.code === "unavailable" || error.code === "network-request-failed") return "Network error. Please check your connection."
    return "Failed to fetch data. Please try again later."
}

const useChatMessages = (collectionRef) => {
    const [messages, setMessages] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [hasMore, setHasMore] = useState(false)
    const [retryFlag, setRetryFlag] = useState(0)

    const oldestDocRef = useRef(null)
    const isFetchingRef = useRef(false)

    useEffect(() => {
        if (!collectionRef) return

        setLoading(true)
        setError(null)
        setMessages([])
        setHasMore(false)
        oldestDocRef.current = null
        isFetchingRef.current = false

        const q = query(collectionRef, orderBy("timestamp", "asc"), limitToLast(PAGE_SIZE))

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const snapshotMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))

            setMessages(prev => {
                if (snapshot.empty) return []
                // Preserve any historically paginated messages (not in current snapshot window)
                const snapshotIds = new Set(snapshot.docs.map(d => d.id))
                const historical = prev.filter(m => !snapshotIds.has(m.id))
                return [...historical, ...snapshotMessages]
            })

            if (!snapshot.empty) {
                // Only set the cursor the first time — fetchMore updates it from there
                if (!oldestDocRef.current) {
                    oldestDocRef.current = snapshot.docs[0]
                }
                setHasMore(snapshot.docs.length >= PAGE_SIZE)
            } else {
                setHasMore(false)
            }

            setLoading(false)
        }, (err) => {
            console.error(err)
            setError(getErrorMessage(err))
            setLoading(false)
        })

        return () => unsubscribe()
    }, [collectionRef, retryFlag])

    const fetchMore = useCallback(async () => {
        if (isFetchingRef.current || !hasMore || !oldestDocRef.current || !collectionRef) return

        isFetchingRef.current = true
        try {
            const q = query(
                collectionRef,
                orderBy("timestamp", "asc"),
                endBefore(oldestDocRef.current),
                limitToLast(PAGE_SIZE)
            )

            const snapshot = await getDocs(q)

            if (snapshot.empty) {
                setHasMore(false)
                return
            }

            const olderMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            setMessages(prev => [...olderMessages, ...prev])
            oldestDocRef.current = snapshot.docs[0]
            setHasMore(snapshot.docs.length >= PAGE_SIZE)
        } catch (err) {
            console.error(err)
            setError(getErrorMessage(err))
        } finally {
            isFetchingRef.current = false
        }
    }, [collectionRef, hasMore])

    const refetch = useCallback(() => setRetryFlag(prev => prev + 1), [])

    return { messages, loading, error, hasMore, fetchMore, refetch }
}

export default useChatMessages
