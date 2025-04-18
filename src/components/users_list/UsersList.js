import { useState, useMemo, useRef } from "react"
import { firestore, collection, where } from "../../api/firebase"
import { useAuth } from "../../contexts/authContext"
import UsersQuery from "./UsersQuery"
import JoinPopUp from "../JoinPopUp"
import ActiveUser from "./ActiveUser"
import useFirestoreBatch from "../../hooks/useFirestoreBatch"
import InfiniteScroll from "react-infinite-scroll-component"
import { ClipLoader } from "react-spinners"
import UserSkeleton from "../skeletons/UserSkeleton"

const UsersList = () => {
  // Context
  const { user } = useAuth()
  
  // State
  const [isUsersQueryShown, setIsUsersQueryShown] = useState(false)
  const [isJoinPopupShown, setIsJoinPopupShown] = useState(false)

  // Memoized values
  const usersRef = useMemo(() => {
    return collection(firestore, 'profiles')
  }, [])

  const activeUsersRef = useRef(null)

  // Custom hooks
  const {data: users, loading, fetchMore, hasMore } = useFirestoreBatch(usersRef, 10, [where("isActive", "==", true)])

  // Functions
  const findPeopleToFollow = (e) => {
    e.stopPropagation()
    if(!user) {
      setIsJoinPopupShown(true)
    } else {
      setIsUsersQueryShown(true)
    }
  }

  return (
    <div className="users-list-container">
      <div 
        className="active-users-container"
        id="scrollableActiveUsersDiv"
        ref={activeUsersRef}
      >
        <InfiniteScroll
          dataLength={users.length}
          next={fetchMore}
          hasMore={hasMore}
          //loader={<ClipLoader color="salmon" />}
          scrollThreshold={0.9}
          endMessage={
           <p style={{ textAlign: 'center' }}>

           </p>
          }
          scrollableTarget="scrollableActiveUsersDiv"
        >
          <div>
            {
              loading ? <UserSkeleton /> : (
                users.length > 0 ? (users.map((usr, index) => <ActiveUser key={index} user={usr} />)) : <p>Noone is online.</p>
              )
            }
          </div>
        </InfiniteScroll>
      </div>
      <button onClick={findPeopleToFollow} className="users-list-follow-button">find people to follow</button>
      { isUsersQueryShown && <UsersQuery {...{ setIsUsersQueryShown }}/>}
      { isJoinPopupShown && <JoinPopUp setIsPopUpShown={setIsJoinPopupShown} /> }
    </div>
  )
}

export default UsersList


            


     

