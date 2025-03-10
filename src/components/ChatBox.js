import { useState, useEffect, useRef } from "react"
import {
    firestore, 
    collection,
    doc, 
    query, 
    where, 
    getDocs, 
    addDoc, 
    setDoc,
    updateDoc,
    serverTimestamp,
    orderBy, 
    onSnapshot,
    limit,
    startAfter,
    database,
    set,
    onValue,
    ref
} from "../api/firebase"
import { format } from "date-fns"
import Input from './Input'
import Button from './Button'
import TypingIndicator from "./TypingIndicator"
import Message from "./Message"
import { useAuth } from "../contexts/authContext"
import { snap } from "gsap"

//OBAVEZNO DA IZMENIM OVO PROFILEUID U OTHERUSERUID I SVE U SKLADU SA TIME
//SVE JE NECITLJIVO I KONFUZNO ZBOG TOGA 
const ChatBox = ({profileUid, profile, setIsChatBoxVisible}) => {
    const { user } = useAuth()
    const [chatId, setChatId] = useState('')
    const [message, setMessage] = useState('')
    const [messages, setMessages] = useState([])
    const [lastVisible, setLastVisible] = useState(null)
    const [loading, setLoading] = useState(false)

    const [initialLoad, setInitialLoad] = useState(true)
    const [isFetchingOldMessages, setIsFetchingOldMessages] = useState(false)

    const [visibleDate, setVisibleDate] = useState("")

    const [isTyping, setIsTyping] = useState(false)

    const typingRef = ref(database, `typingStatus/${chatId}/${user.uid}`)
    const typingTimeoutRef = useRef(null)

    const chatRef = useRef(null)
    const messageRefs = useRef([])
    //for initializing the visibleDate when chatBox mounts
    const initialized = useRef(false)


    // Create or get the chatId when the component mounts or user UIDs change
    useEffect(() => {
        const generatedChatId = [user?.uid, profileUid].sort().join("_")
        setChatId(generatedChatId)
    }, [user?.uid, profileUid])

    console.log("gde je chat id", chatId)

    // Real-time listener for fetching messages
    
    useEffect(() => {
        if(!chatId) return

        const messagesRef = collection(firestore, "chats", chatId, "messages")
        const messagesQuery = query(messagesRef, orderBy("timestamp", "desc"), limit(10))
        //console.log("messages q:", messagesQuery) 

        
        const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
            if(!snapshot.empty) {
                const newMessages = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    timestamp: doc.data().timestamp ? doc.data().timestamp.toDate() : null //sto??
                }))
                setMessages(newMessages.reverse())
                setLastVisible(snapshot.docs[snapshot.docs.length - 1])

                //markMessagesAsSeen(newMessages)

            }
        })
        return () => unsubscribe()
    }, [chatId])

   

    const loadMoreMessages = () => {
        if (loading || !lastVisible) return
        setLoading(true)

        setIsFetchingOldMessages(true) // Prevent auto-scroll

        const chatBox = chatRef.current
        const scrollPosition = chatBox.scrollTop

    
        const messagesRef = collection(firestore, "chats", chatId, "messages")
        const messagesQuery = query(messagesRef, orderBy("timestamp", "desc"), startAfter(lastVisible || 0), limit(10))

        const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
          if (!snapshot.empty) {
            const newMessages = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp ? doc.data().timestamp.toDate() : null //sto??
            })).reverse()
            setMessages(prevMessages => [ ...newMessages, ...prevMessages]) // Append older messages
            setLastVisible(snapshot.docs[snapshot.docs.length - 1])
          } 

          setTimeout(() => {
            // Maintain scroll position
            chatBox.scrollTop = scrollPosition + 10
          }, 0)
    
          setIsFetchingOldMessages(false)
          setLoading(false)

        })
      
        return () => unsubscribe()
    }
      

    const handleScroll = () => {
        if(chatRef.current) {
            const chatBox = chatRef.current
            console.log(chatBox.scrollTop)
            
            // Check if user scrolled to the top
            if(chatBox.scrollTop === 0) {
                loadMoreMessages()
                //console.log("TOP")
            }
        }
    }

      
    useEffect(() => {
        const chatBox = chatRef.current
        if(chatBox) {
            chatBox.addEventListener("scroll", handleScroll)
            return () => chatBox.removeEventListener("scroll", handleScroll)
        }
    }, [messages])

    useEffect(() => {
        if(messages.length < 11) {
            const chatBox = chatRef.current
        
            if (messages.length > 0) {
                if (initialLoad) {
                    // First load -> scroll to bottom
                    setTimeout(() => {
                        chatBox.scrollTop = chatBox.scrollHeight
                    }, 0)
                    setInitialLoad(false)
                } else if (!isFetchingOldMessages) {
                    // New message sent -> scroll to bottom
                    setTimeout(() => {
                        chatBox.scrollTop = chatBox.scrollHeight
                    }, 0)
                }
            }
        }
    }, [messages])
  
    const sendMessage = async (e, userA, userBUid) => {
        e.preventDefault()
        //treba da dodas da ne moze da se posalje prazna poruka

        try {
            const chatsRef = collection(firestore, 'chats')
            const chatDoc = doc(chatsRef, chatId)

            // Ensure consistent order for user IDs (e.g., 'user1_user2' and 'user2_user1' are treated the same)
            //const chatId = [userAUid, userBUid].sort().join("_")

            // Check if the chat exists, if not create it
            const chatSnapshot = await getDocs(query(chatsRef, where("__name__", "==", chatId)))
            
            if(chatSnapshot.empty) {
                // Chat doesn't exist, create a new one
                await setDoc(chatDoc, {
                    participants: [userA.uid, userBUid],
                    createdAt: serverTimestamp(),
                    lastMessage: null
                })
            }

            // Add the message to the messages subcollection of the chat
            const messagesRef = collection(chatDoc, "messages")
            await addDoc(messagesRef, {
                receiverUid: userBUid,
                senderUid: userA.uid,
                senderName: userA.displayName,
                senderPhoto: userA.photoURL,
                content: message,
                timestamp: serverTimestamp(),
                status: 'sent' 
            })

            //update the lastMessage field in the chat document
            await updateDoc(chatDoc, {
                lastMessage: {  
                    senderUid: userA.uid,
                    senderName: userA.displayName,
                    senderPhoto: userA.photoURL,
                    content: message, 
                    timestamp: serverTimestamp() },
              })

            setMessage('')
            set(typingRef, false) // Stop typing indicator when message is sent
            console.log("Message sent successfully!")
        } catch(error) {
            console.error("Error sending message:", error)
        }
    }


    useEffect(() => {
        if(!chatId) return
        const markMessagesAsSeen = async () => {
            const messagesRef = collection(firestore, "chats", chatId, "messages")
            const unseenMessagesQuery = query(
                messagesRef,
                where("receiverUid", "==", user.uid),
                where("status", "==", "sent")
            )
            const querySnapshot = await getDocs(unseenMessagesQuery)
            querySnapshot.forEach(async doc => {
                await updateDoc(doc.ref, {status: 'seen'})
            })
        }

        markMessagesAsSeen()
    }, [chatId, user.uid, messages])
  


    // Handling date based on scrolling

    useEffect(() => {
        const chatBox = chatRef.current
        if(!chatBox) return

        // Create an Intersection Observer
        const observer = new IntersectionObserver((entries) => {
            for(const entry of entries) {
                if(entry.isIntersecting) {
                    const timestamp = entry.target.getAttribute("data-timestamp")
                    if(timestamp) {
                        setVisibleDate(format(timestamp, "dd/MM/yyyy"))
                    }
                    break  // Stop checking after first visible message
                }
            }
        },
        { root: chatBox, threshold: 0 }) // Adjust threshold as needed

        // Observe each message
        messageRefs.current.forEach((message) => {
            if(message instanceof Element) {
                observer.observe(message)
            }
        })

        return () => {
            if (!chatBox) return // Ensure the chat box still exists
            messageRefs.current.forEach((message) => {
                if(message instanceof Element) {
                    observer.unobserve(message)
                }
            })
        }
    }, [messages])

    // Listen for typing status of the other user
    useEffect(() => {
      if (!chatId || !profileUid) return

      const otherTypingRef = ref(database, `typingStatus/${chatId}/${profileUid}`)
      const unsubscribe = onValue(otherTypingRef, (snapshot) => {
        setIsTyping(snapshot.val() === true)
      })

      return () => unsubscribe()
    }, [chatId, profileUid])
  

    // Handle typing indicator
    const handleTyping = () => {
      set(typingRef, true)

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }

      typingTimeoutRef.current = setTimeout(() => {
        set(typingRef, false)
    }, 1500)
    }


    const renderMessages = () => {
        //let lastDate = null

        return messages.map((message, index) => (
          <Message 
            index={index}
            message={message} 
            messages={messages}
           // lastDate={lastDate}
            messageRefs={messageRefs}
          />
        ))
    }

    return (
        <div className="chat-box">
            <div style={{
                position: 'sticky', 
                top: '0', 
                left: '0', 
                right: '0', 
                background: 's', 
                borderBottom: '1px solid black'
            }}>
              <button onClick={() => setIsChatBoxVisible(false)}>x</button>
              <p>
                { profile.displayName }
              </p>
            </div>
            {/* Display messages */}
            <div className="chat-box-messages" ref={chatRef}>
                <span className="date">{visibleDate}</span>
                {renderMessages()}
            </div>
         
            {/* Show typing indicator if the other user is typing */}
            {isTyping && (
              <div style={{display: 'flex', alignItems: 'center'}}>
                <span>{profile.displayName} is typing</span>
                <TypingIndicator />
              </div>
            )}

            <form>
                <Input 
                  type='text'
                  placeholder='...'
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value)
                    handleTyping()
                  }}
                />
                <Button onClick={(e) => sendMessage(e, user, profileUid)}>send</Button>
            </form>
        </div>
    )
}

export default ChatBox