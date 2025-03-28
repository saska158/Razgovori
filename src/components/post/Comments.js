import { useState, useMemo, useRef, useEffect } from "react"
import { database, push, ref } from "../../api/firebase"
import { useAuth } from "../../contexts/authContext"
import EmojiPicker from "emoji-picker-react"
import ChatSmiley from "../ChatSmiley"
import Comment from "./Comment"
import Button from "../Button"
import uploadToCloudinaryAndGetUrl from "../../api/uploadToCloudinaryAndGetUrl"
import { ClipLoader } from "react-spinners"

const Comments = ({comments, roomId, id}) => {
  const initialComment = {
    text: '',
    image: ''
  }

  // Context
  const {user} = useAuth() 

  // State
  const [comment, setComment] = useState(initialComment)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [imagePreview, setImagePreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Hooks that don't trigger re-renders 
  const imageInputRef = useRef(null)
  const inputRef = useRef(null)

  // Memoized Values (`useMemo`)
  const commentsRef = useMemo(() => {
    const room = roomId ? `${roomId}` : `main`
    return ref(database, `${room}/${id}/post/comments`)
  }, [roomId])

  // Functions
  const handleComment = (e) => {
    setComment(prevComment => ({...prevComment, text: e.target.value}))
  }

  const handleEmojiClick = (emojiObject) => {
    setComment(prevComment => ({...prevComment, text: prevComment.text + emojiObject.emoji}))
  }

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        console.log("result", reader.result)
        setImagePreview(reader.result)
        setComment(prevComment => ({...prevComment, image: reader.result}))
      }
      reader.readAsDataURL(file)
    }
  }

  const addComment = async (e) => {
    e.preventDefault()

    if(comment.text || comment.image) {
      const imageFile = imageInputRef.current.files[0]
      let imageUrl = ''
      setLoading(true)
      if(imageFile) {
        try {
          imageUrl = await uploadToCloudinaryAndGetUrl(imageFile)
        } catch(error) {
            console.error("Getting url failed:", error)
            setError(error)
        } 
      }

      const newComment = {
        ...comment,
        image: imageUrl
      }

      const newCommentData = {
        userId: user.uid,
        name: user.displayName,
        photoURL: user.photoURL,
        content: newComment,
        timestamp: Date.now()
      }

      try {
        await push(commentsRef, newCommentData)
        setComment(initialComment)
      } catch(error) {
            console.error("Error sending comment", error)
      } finally {
            setImagePreview(null)
            setLoading(false)
      }
    }
  }

  // Effects
  useEffect(() => {
    if(inputRef.current) {
      inputRef.current.focus()
    }
  }, [comments])

  return (
    <div style={{fontSize: '.7rem', marginLeft: '2em', padding: '1em', position: 'relative'}}>
      <form 
        onSubmit={addComment}
        style={{display: 'flex'}}
      >
        <label 
          style={{
            borderRadius: '20px', 
            border: '.3px solid salmon', 
            display: 'flex', 
            alignItems: 'center'
          }}
        >
          <input
            type="text"
            placeholder="Add a comment"
            value={comment.text}
            onChange={handleComment}
            style={{border: '0'}}
            ref={inputRef}
          />
          {/* image preview */}
          {
            imagePreview && (
              <img
                src={imagePreview}
                alt="image-post"
                style={{
                  width: '40px', 
                  height: '40px', 
                  objectFit: 'cover', 
                  objectPosition: 'top',
                  margin: '.5em'
                  }}
              />
            )
          }
          {/* ovo je za slike */}
          <label
            style={{
              position: 'relative',
              display: 'inline-block',
              cursor: 'pointer',
              width: '20px',
              height: '20px',
            }}
          >
            <Button
              onClick={(e) => {e.preventDefault()}}
              style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                padding: '0'
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6" style={{width: '100%', color: 'salmon'}}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
            </Button>
            <input 
              type="file"
              accept="image/*"
              style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                cursor: 'pointer',
                opacity: '0'
              }}
              onChange={handleImageChange}
              ref={imageInputRef}
            />
          </label>
          <ChatSmiley setShowEmojiPicker={setShowEmojiPicker} />
        </label>
        {
          comment.text || comment.image ? (
            <button 
              type="submit"
              style={{marginLeft: 'auto'}}
              disabled={loading}
            >
              {
                loading ? (
                  <ClipLoader color="salmon"/>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6" style={{width: '25px', color: 'salmon'}}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                  </svg>
                )
              }
            </button>
          ) : null
        }
      </form>
      {
        showEmojiPicker && (
          <div>
            <EmojiPicker 
              onEmojiClick={handleEmojiClick} 
              style={{
                position: 'absolute',
                top: '0',
                left: '0',
                width: '50%',
              }}
            />
          </div>
        )
      }
      <div style={{padding: '1em 0'}}>
        {
          comments.length > 0 ? (
            comments.map((comment, index) => (
              <Comment 
                comment={comment} 
                index={index} 
              />
            ))
          ) : (
            <p>No comments yet</p>
          )
        }
      </div>
    </div>
  )
}

export default Comments