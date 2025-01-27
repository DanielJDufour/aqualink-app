import app from "../firebase";
import requests from "../helpers/requests";
import { User } from "../store/User/types";
import type { Site } from "../store/Sites/types";

const createUser = (email: string, password: string) =>
  app && app.auth().createUserWithEmailAndPassword(email, password);

const storeUser = (
  fullName: string,
  email: string,
  organization: string,
  token?: string
) =>
  requests.send<User>({
    method: "POST",
    url: "users",
    data: {
      fullName,
      email,
      organization,
    },
    token,
  });

const resetPassword = (email: string) => {
  if (app) {
    app.auth().sendPasswordResetEmail(email, { url: "https://aqualink.org" });
  }
};

const getSelf = (token?: string) =>
  requests.send<User>({
    method: "GET",
    url: "users/current",
    token,
  });

const getAdministeredSites = (token?: string) =>
  requests.send<Site[]>({
    method: "GET",
    url: "users/current/administered-sites",
    token,
  });

const signInUser = (email: string, password: string) =>
  app && app.auth().signInWithEmailAndPassword(email, password);

const signOutUser = () => app && app.auth().signOut();

export default {
  createUser,
  storeUser,
  getAdministeredSites,
  getSelf,
  resetPassword,
  signInUser,
  signOutUser,
};
