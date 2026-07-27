import { collection, firestore, query, orderBy, startAt, endAt, getDocs, limit } from './firebase'

const searchUsers = async (searchQuery) => {
  if (!searchQuery) return []

  const lowerSearch = searchQuery.toLowerCase()
  const capitalSearch = searchQuery[0].toUpperCase() + searchQuery.slice(1).toLowerCase()

  const buildQ = (term) => query(
    collection(firestore, 'profiles'),
    orderBy('displayName'),
    startAt(term),
    endAt(term + ''),
    limit(5)
  )

  const queries = [buildQ(lowerSearch)]
  if (capitalSearch !== lowerSearch) queries.push(buildQ(capitalSearch))

  const snapshots = await Promise.all(queries.map(q => getDocs(q)))
  const seen = new Set()
  const results = []

  snapshots.forEach(snapshot => {
    snapshot.docs.forEach(doc => {
      if (!seen.has(doc.id)) {
        seen.add(doc.id)
        results.push({ id: doc.id, display: doc.data().displayName })
      }
    })
  })

  return results.sort((a, b) => a.display.localeCompare(b.display))
}

export default searchUsers
