import { useState, useMemo } from "react"
import { firestore, collection } from "../../api/firebase"
import { useAuth } from "../../contexts/authContext"
import UsersQuery from "./UsersQuery"
import JoinPopUp from "../JoinPopUp"
import ActiveUser from "./ActiveUser"
import useFirestoreBatch from "../../hooks/useFirestoreBatch"
import { ClipLoader } from "react-spinners"

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

  // Custom hooks
  const {data: users, loading, fetchMore, hasMore } = useFirestoreBatch(usersRef, 3)

  // Functions
  const findPeopleToFollow = (e) => {
    e.stopPropagation()
    if(!user) {
      setIsJoinPopupShown(true)
    } else {
      setIsUsersQueryShown(true)
    }
  }

  const activeUsersArray = users.filter(usr => usr.isActive && usr.uid !== user?.uid)
  const activeUsers = activeUsersArray.map(usr => <ActiveUser user={usr} />)

  return (
    <div className="users-list-container">
      <div>{activeUsers.length > 0 ? activeUsers : 'Noone is online.'}</div>
      <div style={{position: 'absolute', bottom: '0', padding: '1em'}}>
        {
          loading ? (
            <ClipLoader color="salmon" />
          ) : (
            hasMore && <button onClick={fetchMore} disabled={loading}>load more</button>
          )
        }
      </div>
      <button onClick={findPeopleToFollow} className="users-list-follow-button">find people to follow</button>
      { isUsersQueryShown && <UsersQuery {...{ setIsUsersQueryShown }}/>}
      { isJoinPopupShown && <JoinPopUp setIsPopUpShown={setIsJoinPopupShown} /> }
    </div>
  )
}

export default UsersList


            


     

