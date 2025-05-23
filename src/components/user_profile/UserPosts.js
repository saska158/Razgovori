import { useMemo, useRef, useState, useEffect } from "react"
import useFirestoreBatch from "../../hooks/useFirestoreBatch"
import { ClipLoader } from "react-spinners"
import { firestore, collection, where } from "../../api/firebase"
import Post from "../post/Post"
import PostSkeleton from "../skeletons/PostSkeleton"
import InfiniteScroll from "react-infinite-scroll-component"
import ErrorMessage from "../errors/ErrorMessage"

const UserPosts = ({profileUid}) => {
    const roomTags = ['main', 'watching', 'reading', 'listening']
    const [room, setRoom] = useState('main')

    const userPostsRef = useMemo(() => {
      return collection(firestore, room)
    }, [room])

    const postsContainerRef = useRef(null)
  
    // Custom hooks
    const { data: posts, loading, error, fetchMore, hasMore, refetch } = useFirestoreBatch(userPostsRef, 2, [where("creatorUid", "==", profileUid)], profileUid)

    return (
        <div>
          <div>
            {
              roomTags.map(tag => (
                <button key={tag} onClick={() => setRoom(tag)} style={{color: room === tag ? "white" : ""}}>{tag}</button>
              ))
            }
          </div>
          <div 
            style={{padding: '.5em', height: '400px', overflowY: 'auto'}} 
            id="scrollableUserPostsDiv"
            ref={postsContainerRef}
          >
            {error && (
              <ErrorMessage message="Failed to load comments." onRetry={refetch} />
            )}
            {
              loading && posts.length === 0 ? (
                <PostSkeleton />
              ) : (
                <InfiniteScroll
                  dataLength={posts.length}
                  next={fetchMore}
                  hasMore={hasMore}
                  loader={<ClipLoader color="salmon" />}
                  scrollThreshold={0.9}
                  scrollableTarget="scrollableUserPostsDiv"
                >
                  <div>
                    {
                      posts.length > 0 ? (
                        posts.map((post, index) => (
                          <Post
                            key={index}
                            post={post}
                            room={room}
                            style={{width: '70%'}}
                          />
                        ))
                      ) : <p>No posts yet.</p>
                    } 
                  </div>  
                </InfiniteScroll>  
              )
            }
          </div>
        </div>
    )
}

export default UserPosts

