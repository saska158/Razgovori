import { useState, useEffect } from "react"
import { useParams } from "react-router-dom"
import { firestore, doc, onSnapshot } from '../api/firebase'
import { useAuth } from "../contexts/authContext"
import ChatBox from '../components/one_on_one_chat/ChatBox'
import PopUp from "../components/PopUp"
import ProfileEditor from "../components/user_profile/ProfileEditor"
import UserProfileHeader from "../components/user_profile/UserProfileHeader"
import UserProfileNavigation from "../components/user_profile/UserProfileNavigation"
import UserProfileContent from "../components/user_profile/UserProfileContent"
import ErrorMessage from "../components/errors/ErrorMessage"
import UserProfileSkeleton from "../components/skeletons/UserProfileSkeleton"

const UserProfile = () => {
  // Context
  const { user } = useAuth()
 
  // State
  const [profile, setProfile] = useState({
    uid: "",
    displayName: "",
    bio: "", 
    currently: {
      watching: '',
      reading: '',
      listening: ''
    },
    favorites: {
      watching: '',
      reading: '',
      listening: ''
    },
    photoURL: "",
    followers: [],
    following: []
  })  
  const [activeSection, setActiveSection] = useState("bio")
  const [isChatBoxVisible, setIsChatBoxVisible] = useState(false)
  const [isFollowPopupShown, setIsFollowPopupShown] = useState(false)
  const [isEditPopupShown, setIsEditPopupShown] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [retryFlag, setRetryFlag] = useState(0)

  // Hooks that don't trigger re-renders 
  const { profileUid } = useParams()

  // Effects
  useEffect(() => {
    const profileRef = doc(firestore, "profiles", profileUid)

    setLoading(true)
    setError(null)

    const unsubscribe = onSnapshot(
      profileRef, 
      (snapshot) => {
        if(snapshot.exists()) {
          setProfile(snapshot.data())
          setError(null)
        }
        setLoading(false)
      },
      (error) => {
        console.error(error)

        let errorMessage
        if (error.code === "unavailable" || error.code === "network-request-failed") {
          errorMessage = "Network error. Please check your connection."
        } else if (error.code === "permission-denied") {
          errorMessage = "You don't have permission to access this profile."
        } else {
          errorMessage = "Failed to load profile. Please try again later."
        }

        setError(errorMessage) 
        setLoading(false)
      }
    )

    return () => unsubscribe()

  }, [profileUid, retryFlag])

  useEffect(() => {
    setIsChatBoxVisible(false)
  }, [profileUid])

  const handleRetry = () => {
    setLoading(true)
    setRetryFlag(prev => prev + 1)
  }

  return (
    <div className="user-profile-container">
      {loading ? <UserProfileSkeleton /> : (
        <div>
        {
        !isChatBoxVisible ? (
          <div style={{display: 'flex', flexDirection: 'column'}}>
            <UserProfileHeader {...{profile, profileUid, setIsEditPopupShown, isChatBoxVisible, setIsChatBoxVisible, setIsFollowPopupShown}} />
            <UserProfileNavigation {...{activeSection, setActiveSection}}/>  
            {
              profileUid && <UserProfileContent {...{activeSection, profile, profileUid}}/>
            }
          </div>
        ) : <ChatBox 
              chatPartnerProfile={profile} 
              setIsChatBoxVisible={setIsChatBoxVisible} 
            />
      }
    
      {
        isEditPopupShown && (
          <PopUp setIsPopUpShown={setIsEditPopupShown}>
            <ProfileEditor {...{profile, setProfile, profileUid}} />
          </PopUp>
        )
      }
      {
        isFollowPopupShown && (
          <PopUp setIsPopUpShown={setIsFollowPopupShown}>
            <p>You need to follow each other to send a message.</p>
          </PopUp>
        )
      }
      </div>
      )}
      { error && <ErrorMessage message={error} isFatal={true} onRetry={handleRetry} /> }
    </div>
  )
}

export default UserProfile





