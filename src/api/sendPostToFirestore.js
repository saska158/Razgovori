import { addDoc, serverTimestamp } from "../api/firebase"
import uploadToCloudinaryAndGetUrl from "./uploadToCloudinaryAndGetUrl"

const sendPostToFirestore =  async (user, data, firestoreRef) => {
    const { text, image, mentionedUids = [] } = data
    let imageUrl = ''

    if(image) {
      imageUrl = await uploadToCloudinaryAndGetUrl(image)
    }

    await addDoc(firestoreRef, {
      creatorUid: user.uid,
      creatorName: user.displayName,
      creatorPhoto: user.photoURL || '',
      content: { text, image: imageUrl },
      mentionedUids,
      timestamp: serverTimestamp(),
      likes: {},
      comments: []
    })
}

export default sendPostToFirestore  