import { useCallback, useEffect, useState } from "react"
import { query, orderBy , limit, startAfter, getDocs, onSnapshot } from "../api/firebase"

const useFirestoreBatch = (collectionRef, pageSize = 3, queryConstraints = [], profileUid=null) => {
    //console.log("Fetching more...")
    const [data, setData] = useState([])
    const [lastDoc, setLastDoc] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [hasMore, setHasMore] = useState(true)

    useEffect(() => {
      if (!collectionRef) return

        const q = query(
            collectionRef,
            ...queryConstraints,
            orderBy("timestamp", "desc"), 
            limit(pageSize)
        )
        setLoading(true)
        setError(null)

        const unsubscribe = onSnapshot(
          q, 
          (snapshot) => { 
            if(!snapshot.empty) {
              const newData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              }))
              setData(newData)
              setLastDoc(snapshot.docs[snapshot.docs.length - 1])
              setHasMore(snapshot.docs.length === pageSize)
            } else {
                setData([])
                setHasMore(false)
            }
            setLoading(false)
          },
          (error) => {
            console.error(error)
            setError(error.message)
            setLoading(false)
          }
        )

        return () => unsubscribe()
    }, [collectionRef, profileUid])

    const fetchData = useCallback(async () => {
      console.log("Fetching more data...")
      if(loading || !hasMore || !lastDoc) return

      try {
        const q = query(
          collectionRef,
          ...queryConstraints,
          orderBy("timestamp", "desc"), 
          startAfter(lastDoc),
          limit(pageSize + 1)
        )

        const snapshot = await getDocs(q)
        const docs = snapshot.docs

        if (docs.length > pageSize) {
          // We have more data, but we only need to store `pageSize` items
          const newData = docs.slice(0, pageSize).map(doc => ({ id: doc.id, ...doc.data() }))
          setData(prevData => [...prevData, ...newData])
          setLastDoc(docs[pageSize - 1]) // Update lastDoc with the last item of the batch
          setHasMore(true) // There is at least one more item to fetch
        } else {
          // Last batch, store only what's available
          const newData = docs.map(doc => ({ id: doc.id, ...doc.data() }))
          setData(prevData => [...prevData, ...newData])
          setLastDoc(null) // No more documents to fetch
          setHasMore(false) // Stop further requests
        }
      } catch(error) {
        console.error(error)
        setError(error.message)
       // setLoading(false)
      } 

      //setLoading(false)
  }, [loading, hasMore, collectionRef, lastDoc, pageSize])

    return { data, loading, error, fetchMore: () => fetchData(), hasMore }
}

export default useFirestoreBatch