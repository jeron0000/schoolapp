import React, { useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "react-toastify";
import { ShopContext } from "../context/shopContext";
import { assets } from "../assets/assets";
import ThemeToggle from "../components/ThemeToggle";
import "../components/StorefrontFoundation.css";
import LoginFlow from "../../../shared/LoginFlow";
import { loginDestination } from "../../../shared/loginNavigation";
import { getAcademicProgramOptions } from "../../../shared/productTaxonomy.js";
import { SESSION_MESSAGE } from "../../../shared/authSession.js";

const Login = () => {
  const {
    token,
    setToken,
    sessionMessage,
    navigate,
    backendUrl,
    productCategories = [],
    categoriesLoading = false,
    categoryError = "",
  } =
    useContext(ShopContext);
  const { search } = useLocation();
  const studentStep =
    Boolean(sessionMessage) ||
    new URLSearchParams(search).get("step") === "student";
  const authenticate = async (credentials, { register }) => {
    const { data } = await axios.post(
      backendUrl + (register ? "/api/user/register" : "/api/user/login"),
      credentials,
    );
    if (!data.success) throw new Error(data.message);
    if (!setToken(data.token)) throw new Error(SESSION_MESSAGE);
    navigate("/");
  };

  if (studentStep && token) return <Navigate to="/" replace />;
  return (
    <LoginFlow
      key={studentStep ? "student" : "account"}
      host="student"
      logo={assets.logo}
      themeToggle={<ThemeToggle />}
      initialStep={studentStep ? "studentLogin" : "account"}
      studentAuthenticated={Boolean(token)}
      programOptions={getAcademicProgramOptions(productCategories)}
      programsLoading={categoriesLoading}
      programsError={categoryError}
      onStudent={() => navigate("/")}
      onAdmin={(panel) =>
        window.location.assign(loginDestination("admin", { panel }))
      }
      onAuthenticate={authenticate}
      onError={(message) => toast.error(message)}
    />
  );
};

export default Login;
