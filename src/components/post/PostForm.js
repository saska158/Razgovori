import { useState, useEffect, useRef } from "react"
import { useAuth } from "../../contexts/authContext"
import extractUrls from "../../utils/extractUrls"
import fetchLinkPreview from "../../api/fetchLinkPreview"
import { readImageAsDataURL } from "../../utils/readImageAsDataURL"
import sendPostToFirestore from "../../api/sendPostToFirestore"
import ImagePreview from "../ImagePreview"
import LinkPreview from "../LinkPreview"
import ImageUploadButton from "../ImageUploadButton"
import ChatSmiley from "../ChatSmiley"
import EmojiPicker from "emoji-picker-react"
import MentionTextarea from "../MentionTextarea"
import { ClipLoader } from "react-spinners"
import ErrorMessage from "../errors/ErrorMessage"


const PostForm = ({firestoreRef, placeholder, setIsPopupShown=()=>{}}) => {
  const initialData = {
    text: '',
    image: '',
    mentionedUids: []
  }
  // Context
  const { user } = useAuth()

  // State
  const [data, setData] = useState(initialData)
  const [imagePreview, setImagePreview] = useState(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [linkData, setLinkData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Hooks that don't trigger re-renders
  const fileInputRef = useRef(null)

  // Functions
  const handleDataChange = (newValue, mentionedUids) => {
    setData(prev => ({...prev, text: newValue, mentionedUids}))
  }

  const handleEmojiClick = (emojiObject) => {
    setData(prev => ({...prev, text: prev.text + emojiObject.emoji}))
  }

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    readImageAsDataURL(
      file,
      (dataURL) => {
        setImagePreview(dataURL)
        setData(prev => ({...prev, image: dataURL}))
      },
      (error) => {
        setError(error)
      }
    )
  }

  const cancelLink = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setLinkData(null)
  }

  const handleOnSubmit = async (e) => {
    e.preventDefault()
    if (!data.text && !data.image) return

    setLoading(true)
    setError(null)

    try {
      await sendPostToFirestore(user, data, firestoreRef)
      setData(initialData)
      setImagePreview(null)
      setShowEmojiPicker(false)
      setLinkData(null)
      fileInputRef.current.value = null
      setIsPopupShown(false)
    } catch (error) {
      console.error("Error sending message:", error)

      let errorMessage

      if (error.code === 'permission-denied') {
        errorMessage = "You don’t have permission to send this message."
      } else if (error.code === 'unavailable') {
        errorMessage = "Network issue. Please try again."
      } else {
        errorMessage = "Something went wrong. Please try again."
      }

      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  // Effects
  useEffect(() => {
    if(!data.text) return
    const fetchData = async () => {
      try {
        const urls = extractUrls(data.text)
        if(urls && urls.length > 0) {
          const linkDetails = await fetchLinkPreview(urls[0]) 
          setLinkData(linkDetails)                            
        }
      } catch(error) {
        console.error("Error fetching link preview:", error)
      } 
    }
    fetchData()
  }, [data.text])


  return (
    <form onSubmit={handleOnSubmit} className="post-form">
      { error && <ErrorMessage message={error} /> }

      <MentionTextarea
        value={data.text}
        onChange={handleDataChange}
        placeholder={placeholder}
        style={{fontSize: '1.5rem', borderBottom: 'none', background: 'transparent', paddingLeft: '0'}}
        maxLength={270}
      />

      {
        linkData && (
          <LinkPreview 
            {...{linkData}} 
            content={data} 
            style={{display: 'flex', alignItems: 'flex-start'}} 
            imgStyle={{width: '30%'}}
          >
            <button onClick={cancelLink} style={{position: 'absolute', top: '0', right: '0'}}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{width: '15px'}}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </LinkPreview>
        )
      }

      { imagePreview && <ImagePreview {...{imagePreview, setImagePreview, fileInputRef}} setState={setData} /> }

      <div className="post-form-icons-container">
        <ImageUploadButton {...{handleImageChange, fileInputRef}} style={{width: '30px', height: '30px'}} />
        <div style={{position: 'relative'}}>
          <ChatSmiley setShowEmojiPicker={setShowEmojiPicker} style={{width: '30px'}} />
          {
            showEmojiPicker && (
              <EmojiPicker 
                onEmojiClick={handleEmojiClick} 
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '0',
                  marginBottom: '.25em',
                  zIndex: '1000',
                  overflow: 'hidden'
                }}
              />
            )
          }
        </div>

        {
          data.text || data.image ? (
            <button type="submit" disabled={loading} className="no-padding-btn">
              {
                loading ? (
                  <ClipLoader color="#4b896f"/>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6" style={{width: '30px', color: '#4b896f'}}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                  </svg>
                )
              }
            </button>
          ) : null
        }
      </div>
    </form>
  )    
}

export default PostForm