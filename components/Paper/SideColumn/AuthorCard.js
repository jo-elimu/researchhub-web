import React, { useState, useEffect } from "react";
import { StyleSheet, css } from "aphrodite";
import PropTypes from "prop-types";

import colors from "~/config/themes/colors";
import icons from "~/config/themes/icons";

const AuthorCard = (props) => {
  const { name } = props;

  return (
    <div className={css(styles.container)}>
      <span className={css(styles.userIcon)}>{icons.user}</span>
      <div className={css(styles.name) + " clamp1"}>{name}</div>
    </div>
  );
};

AuthorCard.propTypes = {
  name: PropTypes.string,
};

const styles = StyleSheet.create({
  container: {
    display: "flex",
    justifyContent: "flex-start",
    alignItems: "center",
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 15px 8px 12px",
    borderLeft: `3px solid #FFF`,
    transition: "all ease-out 0.1s",
    ":hover": {
      cursor: "pointer",
      background: "#FAFAFA",
      borderLeft: `3px solid ${colors.NEW_BLUE()}`,
    },
  },
  name: {
    color: colors.BLACK(1),
    fontWeight: 500,
    marginLeft: 10,
  },
  userIcon: {
    color: "#aaa",
    width: 35,
    height: 35,
    fontSize: 33 + 1,
    border: "3px solid transparent",
  },
});

export default AuthorCard;
