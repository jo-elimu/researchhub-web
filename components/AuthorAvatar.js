import { StyleSheet, css } from "aphrodite";
import { useState } from "react";
import Link from "next/link";

import icons from "~/config/themes/icons";
import colors from "~/config/themes/colors";
import Image from "next/image";

const AuthorAvatar = (props) => {
  const [error, setError] = useState(false);

  const {
    author,
    size = 35,
    disableLink,
    showModeratorBadge,
    twitterUrl,
    border,
    dropShadow,
  } = props;
  let deviceWidth = null;

  const authorId = author && author.id;

  function renderAvatar() {
    return (
      <div style={{ height: size, width: size }}>
        {author && author.profile_image && !error ? (
          <Image
            src={author.profile_image}
            layout="fill"
            className={css(
              styles.avatarImg,
              border && styles.avatarImgWithBorder,
              dropShadow && styles.avatarImgWithShadow
            )}
            alt={"Author Profile Avatar"}
          />
        ) : (
          <span
            className={css(styles.userIcon)}
            style={{
              width: size,
              height: size,
              fontSize: size + 1,
              // border: "3px solid transparent",
            }}
          >
            {icons.user}
          </span>
        )}
        {showModeratorBadge && (
          <Image
            layout="fill"
            src={"/static/icons/moderatorBadge.png"}
            className={css(styles.moderatorBadge)}
          />
        )}
      </div>
    );
  }

  if (twitterUrl) {
    return (
      <div className={css(styles.avatar)}>
        <a
          target="_blank"
          href={twitterUrl}
          className={css(styles.atag)}
          rel="noreferrer noopener"
        >
          {renderAvatar()}
        </a>
      </div>
    );
  }

  return (
    <div className={css(styles.avatar)}>
      {disableLink || !authorId ? (
        renderAvatar()
      ) : (
        <Link
          href={"/user/[authorId]/[tabName]"}
          as={`/user/${authorId}/overview`}
        >
          <a
            href={`/user/${authorId}/overview`}
            className={css(styles.atag)}
            rel="noreferrer noopener"
          >
            {renderAvatar()}
          </a>
        </Link>
      )}
    </div>
  );
};

const styles = StyleSheet.create({
  avatarImg: {
    borderRadius: "50%",
  },
  avatarImgWithBorder: {
    border: "3px solid #F1F1F1",
  },
  avatarImgWithShadow: {
    border: "0px 2px 4px rgba(185, 185, 185, 0.25)",
  },
  avatar: {
    cursor: "pointer",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
    position: "relative",
    borderRadius: "50%",
    // border: "3px solid #F1F1F1",
  },
  moderatorBadge: {
    position: "absolute",
    color: colors.BLUE(),
    bottom: -2,
    right: -5,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: 20,
  },
  atag: {
    color: "unset",
    textDecoration: "unset",
  },
  userIcon: {
    color: "#aaa",
    position: "relative",
    // top: 2,
    left: 0.25,
  },
});

export default AuthorAvatar;
