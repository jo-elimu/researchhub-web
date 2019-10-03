import App from "next/app";
import React from "react";
import withRedux from "next-redux-wrapper";
import { Provider } from "react-redux";
import { configureStore } from "~/redux/configureStore";
import "isomorphic-unfetch";
import { StyleSheet, css } from "aphrodite";
import "../components/Paper/progressbar.css";

// Components
import Navbar from "~/components/Navbar";
class MyApp extends App {
  render() {
    const { Component, pageProps, store } = this.props;
    return (
      <Provider store={store}>
        <div className={css(styles.pageWrapper)}>
          <Navbar />
          <Component {...pageProps} />
        </div>
      </Provider>
    );
  }
}

const styles = StyleSheet.create({
  pageWrapper: {
    width: "100%",
    minHeight: "100vh",
  },
});

export default withRedux(configureStore)(MyApp);
