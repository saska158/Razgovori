import { useState, useEffect, useCallback, useMemo } from "react"
import { useParams } from "react-router-dom"
import { query, orderBy, limit, onSnapshot, getDocs, startAfter, collection, firestore } from "../api/firebase"

const usePosts = (elementRef) => {
    // State
    const [posts, setPosts] = useState([])
    const [lastVisible, setLastVisible] = useState(null)
    //const [hasMore, setHasMore] = useState(null)
    const [loading, setLoading] = useState({
      posts: true,
      morePosts: false
    })

    // Hooks that don't trigger re-renders  
    const { roomId } = useParams()

    // Memoized Values (`useMemo`)
      const roomRef = useMemo(() => {
        const room = roomId ? `${roomId}` : `main`
        return collection(firestore, room)
      }, [roomId])

    // Effects
    useEffect(() => {
      if(!roomRef) return
      //console.log("effects from usePosts")

      const postsQuery = query(roomRef, orderBy("timestamp", "desc"), limit(3))

      const unsubscribe = onSnapshot(postsQuery, (snapshot) => { // neki loading i skeleton
        if(!snapshot.empty) {
          const newPosts = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp ? doc.data().timestamp.toDate() : null
          }))
          setPosts(newPosts.reverse())
          setLastVisible(snapshot.docs[snapshot.docs.length - 1])
          //setHasMore(snapshot.docs.length === 3)
          setLoading(prevLoading => ({...prevLoading, posts: false}))
        } //else {
          //setHasMore(false)
        //}
      })
          
      return () => unsubscribe()
    }, [roomRef, roomId])

    // Functions
    const fetchMorePosts = useCallback(async () => {
      console.log("fetching")
      if(/*!hasMore || */!lastVisible) return

      const postsQuery = query(roomRef, orderBy("timestamp", "desc"), startAfter(lastVisible), limit(3))
      setLoading(prevLoading => ({...prevLoading, morePosts: true}))
      // loading i spinner
      try {
        const snapshot = await getDocs(postsQuery)
        if (!snapshot.empty) {
          const newPosts = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp ? doc.data().timestamp.toDate() : null
          })).reverse()
  
          setPosts(prevPosts => [...newPosts, ...prevPosts])
          setLastVisible(snapshot.docs[snapshot.docs.length - 1])
          //setHasMore(snapshot.docs.length === 3)
        } //else {
          //setHasMore(false)
        //}
      } catch (error) {
        console.error("Error fetching more messages:", error)
        // setError(error)
      } finally {
        setLoading(prevLoading => ({...prevLoading, morePosts: false}))
      } 
    }, [lastVisible, /*hasMore*/])

    return { posts, fetchMorePosts,/* hasMore,*/ loading }
}

export default usePosts