import { NavLink, Outlet } from "react-router-dom"

const GroupChatLayout = () => {

  const routes = [
    { path: "/", label: "Main" },
    { path: "/movies", label: "Movies" },
    { path: "/books", label: "Books" },
    { path: "/music", label: "Music" }
  ]

  return (
    <div className="group-chat-layout-container">
      <div className="group-chat-layout-container-nav"> 
        {routes.map(({ path, label }) => (
          <NavLink
            key={path}
            to={path}
            style={({ isActive }) => ({
              borderBottom: isActive ? ".5px solid white" : "none",
            })}
          >
            {label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}

export default GroupChatLayout