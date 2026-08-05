import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react"
import { firestore, collection, query, where, getDocs, updateDoc, ref, database, onValue } from "../../api/firebase"
import TypingIndicator from "./TypingIndicator"
import Message from "./Message"
import { useAuth } from "../../contexts/authContext"
import ChatBoxHeader from "./ChatBoxHeader"
import ChatBoxForm from "./ChatBoxForm"
import useChatMessages from "../../hooks/useChatMessages"
import { format } from "date-fns"
import { ClipLoader } from "react-spinners"
import ErrorMessage from "../errors/ErrorMessage"

const FETCH_TRIGGER_THRESHOLD = 80

const ChatBox = ({ chatPartnerProfile, setIsChatBoxVisible }) => {
    const { user } = useAuth()

    const [chatId, setChatId] = useState('')
    const [visibleDate, setVisibleDate] = useState('')
    const [isTyping, setIsTyping] = useState(false)

    const containerRef = useRef(null)
    const messageRefs = useRef([])
    const scrollAnchorRef = useRef(null)
    const isAtBottomRef = useRef(true)
    const prevMsgCountRef = useRef(0)

    const messagesRef = useMemo(() => {
        if (!chatId) return null
        return collection(firestore, "chats", chatId, "messages")
    }, [chatId])

    const { messages, loading, error, hasMore, fetchMore, refetch } = useChatMessages(messagesRef)

    // Generate chat ID
    useEffect(() => {
        if (!user?.uid || !chatPartnerProfile?.uid) return
        setChatId([user.uid, chatPartnerProfile.uid].sort().join("_"))
    }, [user?.uid, chatPartnerProfile?.uid])

    // Mark received messages as seen
    useEffect(() => {
        if (!chatId) return
        const markAsSeen = async () => {
            try {
                const ref = collection(firestore, "chats", chatId, "messages")
                const q = query(ref, where("receiverUid", "==", user.uid), where("status", "==", "sent"))
                const snapshot = await getDocs(q)
                snapshot.forEach(async doc => {
                    try { await updateDoc(doc.ref, { status: "seen" }) } catch (e) { console.error(e) }
                })
            } catch (e) { console.error(e) }
        }
        markAsSeen()
    }, [chatId, user?.uid, messages])

    // Typing indicator
    useEffect(() => {
        if (!chatId || !chatPartnerProfile) return
        const typingRef = ref(database, `typingStatus/${chatId}/${chatPartnerProfile.uid}`)
        const unsubscribe = onValue(typingRef, snapshot => setIsTyping(snapshot.val() === true), e => console.error(e))
        return () => unsubscribe()
    }, [chatId, chatPartnerProfile?.uid])

    // Scroll management — runs before paint to prevent flicker
    useLayoutEffect(() => {
        const container = containerRef.current
        if (!container) return

        if (messages.length === 0) {
            prevMsgCountRef.current = 0
            isAtBottomRef.current = true
            return
        }

        if (scrollAnchorRef.current) {
            // Older messages prepended — shift scrollTop by the height gained at the top
            const { scrollTop, scrollHeight } = scrollAnchorRef.current
            container.scrollTop = scrollTop + (container.scrollHeight - scrollHeight)
            scrollAnchorRef.current = null
        } else {
            const isInitialLoad = prevMsgCountRef.current === 0
            const lastMessage = messages[messages.length - 1]
            const userJustSent = lastMessage?.senderUid === user?.uid && messages.length > prevMsgCountRef.current

            if (isInitialLoad || isAtBottomRef.current || userJustSent) {
                container.scrollTop = container.scrollHeight
            }
        }

        prevMsgCountRef.current = messages.length
    }, [messages])

    // Capture scroll position before fetchMore
    const handleFetchMore = useCallback(() => {
        const container = containerRef.current
        if (!container || !hasMore || scrollAnchorRef.current) return
        scrollAnchorRef.current = {
            scrollTop: container.scrollTop,
            scrollHeight: container.scrollHeight,
        }
        fetchMore()
    }, [fetchMore, hasMore])

    // Messages render null until their profile fetch resolves; MutationObserver catches the DOM growth after
    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const observer = new MutationObserver(() => {
            if (!scrollAnchorRef.current && isAtBottomRef.current) {
                container.scrollTop = container.scrollHeight
            }
        })

        observer.observe(container, { childList: true, subtree: true })
        return () => observer.disconnect()
    }, [])

    // Scroll listener: bottom proximity, fetchMore trigger, date label
    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = container

            isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 100

            if (scrollTop < FETCH_TRIGGER_THRESHOLD && hasMore) {
                handleFetchMore()
            }

            if (messageRefs.current.length === 0) return
            const containerTop = container.getBoundingClientRect().top
            let closest = null
            let closestDist = Infinity
            messageRefs.current.forEach(el => {
                if (!el) return
                const rect = el.getBoundingClientRect()
                const dist = Math.abs(rect.top - containerTop)
                if (rect.top >= containerTop && dist < closestDist) {
                    closestDist = dist
                    closest = el
                }
            })
            if (closest) setVisibleDate(closest.dataset.timestamp)
        }

        container.addEventListener("scroll", handleScroll, { passive: true })
        return () => container.removeEventListener("scroll", handleScroll)
    }, [hasMore, handleFetchMore])

    let lastDate = null

    return (
        <div className="chat-box">
            <ChatBoxHeader {...{ chatPartnerProfile, setIsChatBoxVisible }} />
            <div className="chat-box-messages" ref={containerRef}>
                {messages.length > 0 && visibleDate && <p className="date">{visibleDate}</p>}
                <div style={{ marginTop: "auto" }}>
                    {loading ? (
                        <ClipLoader color="#4f3524" size={20} />
                    ) : (
                        messages.map((message, index) => {
                            const messageDate = message.timestamp
                                ? format(message.timestamp.toDate(), "dd/MM/yyyy")
                                : ""
                            const showDateDivider = lastDate !== messageDate
                            lastDate = messageDate
                            return (
                                <Message
                                    key={message.id}
                                    index={index}
                                    message={message}
                                    showDateDivider={showDateDivider}
                                    messageRefs={messageRefs}
                                    messageDate={messageDate}
                                    isLastIndex={index === messages.length - 1}
                                />
                            )
                        })
                    )}
                </div>
            </div>
            {isTyping && (
                <div className="typing-container">
                    <span>{chatPartnerProfile.displayName} is typing</span>
                    <TypingIndicator />
                </div>
            )}
            <ChatBoxForm {...{ messages, chatPartnerProfile, chatId }} />
            {error && <ErrorMessage message={error} isFatal={true} onRetry={refetch} />}
        </div>
    )
}

export default ChatBox
