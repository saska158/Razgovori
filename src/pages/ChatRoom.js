import { useState, useEffect, useMemo, useRef } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { database, ref, push, onValue } from "../api/firebase"
import { useAuth } from '../contexts/authContext'
import Input from "../components/Input"
import Button from "../components/Button"
import Post from "../components/Post"
import PopUp from "../components/PopUp"
import fetchLinkPreview from "../api/fetchLinkPreview"
import extractUrls from "../utils/extractUrls"
import EmojiPicker from "emoji-picker-react"

const ChatRoom = () => {
    
    const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dsjpoak0f/upload"  
    const UPLOAD_PRESET = "profile_pictures"
    
    const initialPost = {
      text: "",
      image: ""
    }
    const [post, setPost] = useState(initialPost)
    const [posts, setPosts] = useState([])
    const [videoData, setVideoData] = useState(null)
    const [showEmojiPicker, setShowEmojiPicker] = useState(false)
    const [selectedEmoji, setSelectedEmoji] = useState([])
    const [imagePreview, setImagePreview] = useState(null)
    const [imageFile, setImageFile] = useState(null)

    const [isPopupShown, setIsPopupShown] = useState(false)
    const [isJoinPopupShown, setIsJoinPopupShown] = useState(false)

    const { user } = useAuth()
    
    const formRef = useRef(null)

    const linkPreviewRef = useRef(null)
    const imageInputRef = useRef(null)

    const [uploading, setUploading] = useState(false)

    const navigate = useNavigate()

    const { roomId } = useParams()

    const roomRef = useMemo(() => {
      const room = roomId ? `${roomId}` : `main`
      return ref(database, room)
    }, [roomId])

    // Effect to detect and fetch preview when user types a URL
    useEffect(() => {
      const urls = extractUrls(post.text)

      if (urls && urls.length > 0) {
          fetchLinkPreview(urls[0]).then(setVideoData) // We take the first URL from the input
      } else {
          setVideoData(null) // Clear preview if no URL is detected
      }
    }, [post.text]) 

    const handleTextChange = (e) => {
      setPost(prevPost => ({...prevPost, text: e.target.value}))
    }

    console.log("post", post)
    //OVDE PORED TOGA STO PORUKU SALJEMO U REALTIMEDATABASE, TREBALO BI I U FIRESTORE U DOKUMENT
    //NPR TE OSOBE POD PROPERTIJEM MOJE PORUKE/MOJI POSTOVI
    //DA BISMO U PROFILU TE OSOBE PRIKAZALI NJENE POSTOVE
    const createPost =  async (e) => {
      e.preventDefault()
      if(post.text || post.image) {
        const imageFile = imageInputRef.current.files[0]
      setUploading(true)

      let imageUrl = ''

      if(imageFile) {
        const formData = new FormData()
        formData.append("file", imageFile)
        formData.append("upload_preset", UPLOAD_PRESET)

        try {
          const response = await fetch(CLOUDINARY_URL, {
            method: 'POST',
            body: formData
          })
          const data = await response.json()
          if(data.secure_url) {
            imageUrl = data.secure_url
          }
        } catch(error) {
          console.error("Upload failed:", error)
        } finally {
          setUploading(false)
          setImageFile(null)
        }
      }

      const newPost = {
        ...post, 
        image: imageUrl
      }
    
      //slanje u realtime database
      push(roomRef, {
        creatorUid: user.uid,  
        creatorName: user.displayName, 
        photoUrl: user.photoURL || '',
        post: newPost,
        room: roomId || 'main'
      })
      setPost(initialPost)
      setIsPopupShown(false)
      }
    }

    /* postavljamo slushac poruka u realtime-u */
    useEffect(() => {
      const unsubscribe = onValue(roomRef, (snapshot) => {
        const data = snapshot.val()
        if(data) {
          const postsArray = Object.keys(data).map((key) => ({id: key, ...data[key]}))
          setPosts(postsArray)
        } else {
          setPosts([])
        }
      })
  
      return () => unsubscribe()
    }, [roomRef])

    useEffect(() => {
      const handleClickOutside = (e) => {
        if(formRef.current && !formRef.current.contains(e.target)) {
          setIsPopupShown(false)
          setPost(initialPost)
        }
      }
      document.addEventListener("click", handleClickOutside)
      return () => document.removeEventListener("click", handleClickOutside)
    }, [])

    const toggleEmojiPicker = (e) => {
      e.preventDefault()
      //e.stopPropagation()
      setShowEmojiPicker(prev => !prev)
    }

    const handleEmojiClick = (emojiObject) => {
      setPost(prevPost => ({...prevPost, text: prevPost.text + emojiObject.emoji}))
    }

    const handleImageChange = (e) => {
      const file = e.target.files[0]
      if (file) {
        setImageFile(file)
        const reader = new FileReader()
        reader.onloadend = () => {
          console.log("result", reader.result)
          setImagePreview(reader.result)
          setPost(prevPost => ({...prevPost, image: reader.result}))
        }
        reader.readAsDataURL(file)
      }
    }


    return (
        <div style={{ 
            display: 'flex', 
            flexDirection: "column",
            height: '550px',
            overflow: 'auto',
        }}>
          <button
            style={{
              border: '.3px solid grey',
              background: 'rgb(241, 241, 241)',
              width: '70%',
              borderRadius: '20px',
              padding: '1em 1.5em',
              margin: '.7em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '.5em'
            }}
            onClick={(e) => {
              e.stopPropagation()
              if(!user) {
                setIsJoinPopupShown(true)
              } else {
                setIsPopupShown(true)
              }
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6" style={{width: '20px'}}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
            </svg>
            <span>new post</span>
          </button>

          {
            isPopupShown && (
              <PopUp setIsPopUpShown={setIsPopupShown} setShowEmojiPicker={setShowEmojiPicker}>
                <form 
                  style={{
                    //background: 'white',
                    //width: '50%',
                    //height: '500px',
                    //position: 'absolute',
                    //top: '50%',
                    //left: '50%',
                    //transform: 'translate(-50%, -50%)',
                   // padding: '1em',
                    //borderRadius: '30px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1em',
                    height: '100%',
                  }}
                  ref={formRef}
                >
                  <div style={{border: '.3px solid salmon', borderRadius: '20px', padding: '1em'}}>
                    <textarea
                      value={post.text}
                      onChange={handleTextChange}
                      placeholder="let's waste time"
                      style={{
                        width: '100%', 
                        minHeight: imagePreview ? '50px' : '200px', 
                        maxHeight: '300px', 
                        padding: '1em'
                      }}
                  
                    />
                    {
                      imagePreview && (
                        <img
                          src={imagePreview}
                          alt="image-post"
                          style={{width: '500px', height: '350px', objectFit: 'cover', objectPosition: 'top'}}
                        />
                      )
                    }
                  </div>
                  <Button 
                    onClick={createPost}
                    style={{
                      background: 'salmon',
                      color: 'white',
                      borderRadius: '20px',
                      padding: '.5em 1em',
                      alignSelf: 'flex-end'
                    }}
                  >
                    post
                  </Button>  
                  <div 
                    style={{
                      display: 'flex',
                      gap: '.5em',
                      marginTop: 'auto',
                      justifyContent: 'flex-end'
                    }}
                  >
                    <label
                      style={{
                        position: 'relative',
                        display: 'inline-block',
                        cursor: 'pointer',
                        //borderRadius: '50%',
                        width: '25px',
                        height: '25px',
                        //background: 'blue'
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
                    <Button 
                      onClick={(e) => toggleEmojiPicker(e)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6" style={{width: '25px', color: 'salmon'}}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
                      </svg>
                    </Button>
                  </div>
                  {
                    showEmojiPicker && (
                      <div>
                        <EmojiPicker 
                          onEmojiClick={handleEmojiClick} 
                          style={{
                            position: 'absolute',
                            bottom: '0',
                            left: '0',
                            width: '70%',
                            height: '75%' 
                          }}
                        />
                      </div>
                    )
                  }
              
                  {
                    videoData && (
                      <div 
                        style={{ 
                          marginTop: "10px", 
                          border: "1px solid #ccc", 
                          padding: "10px" 
                        }}
                        ref={linkPreviewRef}
                      >
                        <button onClick={() => {
                          if(linkPreviewRef.current) {
                            linkPreviewRef.current.style.display = "none"}}}>*/
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{width: '20px'}} /*className="size-6"*/>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                        <a href={videoData.url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={videoData.image}
                            alt={videoData.title}
                            style={{ width: "70%", marginRight: "10px" }}
                          />
                          <div>
                            <p style={{textTransform: 'initial'}}>{videoData.title}</p>
                          </div>
                        </a>
                      </div>
                    )
                  }
                </form> 
              </PopUp>
            )
          }
          
          <div style={{
            background: 'rgb(253, 239, 237)',
            display: 'flex',
            flexDirection: "column-reverse",
            flex: '1',
          }}>
            {
              posts.length > 0 && posts.map(postItem => <Post
                                              key={postItem.id}
                                              id={postItem.id}
                                              creatorUid={postItem.creatorUid}
                                              photoUrl={postItem.photoUrl}
                                              creatorName={postItem.creatorName}
                                              post={postItem.post}
                                              emoji={selectedEmoji}
                                              //setPost={setPost}
                                              roomId={roomId}
                                            />)
            }
          </div>

          {
            isJoinPopupShown && (
              <PopUp setIsPopUpShown={setIsJoinPopupShown}>
                <h1>Razgovori</h1>
                <p>Sign in or create your account to join the conversation!</p>
                <Link to="/sign-up">
                  <button 
                    style={{
                      fontSize: '1rem', 
                      background: 'salmon', 
                      padding: '.7em 1.2em', 
                      borderRadius: '10px',
                      color: 'white'
                    }}
                  >
                    Create an account
                  </button>
                </Link>
                <Link to="/sign-in">
                  <button 
                    style={{
                      fontSize: '1rem',
                      padding: '.7em 1.2em', 
                      borderRadius: '10px',
                      background: 'rgba(238, 171, 163, .5)'
                    }}
                  >
                    Sign in
                  </button>
                </Link>
              </PopUp>
            )
          }
        </div>
    )
}

export default ChatRoom

/*
{
            isPopupShown && (
              <div
                style={{
                  position: 'fixed',
                  top: '0',
                  left: '0',
                  width: '100%',
                  height: '100%',
                  background: 'rgba(238, 171, 163, .5)'
                }}
              >
                <form 
                  style={{
                    background: 'white',
                    width: '50%',
                    height: '500px',
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    padding: '1em',
                    borderRadius: '30px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1em'
                  }}
                  ref={formRef}
                >
              
                  <textarea
                    value={post.text}
                    onChange={handleTextChange}
                    placeholder="let's waste time"
                    rows="4"
                    style={{width: '100%', padding: '1em'}}
                  />
                  <Button 
                    onClick={createPost}
                    style={{
                      background: 'salmon',
                      color: 'white',
                      borderRadius: '20px',
                      padding: '.5em 1em',
                      alignSelf: 'flex-end'
                    }}
                  >
                    post
                  </Button>  
                  <Button style={{marginTop: 'auto', alignSelf: 'flex-end'}}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6" style={{width: '25px', color: 'salmon'}}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                    </svg>
                  </Button>
              
                  {
                    videoData && (
                      <div 
                        style={{ 
                          marginTop: "10px", 
                          border: "1px solid #ccc", 
                          padding: "10px" 
                        }}
                        ref={linkPreviewRef}
                      >
                        <button onClick={() => {
                          if(linkPreviewRef.current) {
                            linkPreviewRef.current.style.display = "none"}}}>*/
                          //<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{width: '20px'}} /*className="size-6"*/>
                          //<path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          //</svg>
                       // </button>
                       // <a href={videoData.url} target="_blank" rel="noopener noreferrer">
                         // <img
                         //   src={videoData.image}
                          //  alt={videoData.title}
                          //  style={{ width: "70%", marginRight: "10px" }}
                          ///>
                          //<div>
                          //  <p style={{textTransform: 'initial'}}>{videoData.title}</p>
                          //</div>
                        //</a>
                      //</div>
                  //)}
               // </form> 
             // </div>
           // )
          //}
