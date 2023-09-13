import { toTitleCase } from "~/config/utils/string";
import Link from "next/link";
import { Hub } from "~/config/types/hub";
import IconButton from "~/components/Icons/IconButton";
import { useState } from "react";
import { StyleSheet, css } from "aphrodite";
import colors from "~/config/themes/colors";

const DocumentHubs = ({
  hubs,
  withShowMore = true,
}: {
  hubs: Hub[];
  withShowMore: boolean;
}) => {
  const [showMore, setShowMore] = useState<boolean>(false);
  const sortedHubs = hubs.sort((a, b) => {
    return a.relevancyScore > b.relevancyScore ? -1 : 1;
  });
  const visibleHubs = showMore ? sortedHubs : sortedHubs.slice(0, 3);

  return (
    <div className={css(styles.wrapper)}>
      {visibleHubs.map((h, index) => (
        <div key={index}>
          <Link key={`/hubs/${h.slug ?? ""}-index`} href={`/hubs/${h.slug}`}>
            <IconButton variant="round" overrideStyle={styles.hubBtn}>
              <span>{toTitleCase(h.name)}</span>
            </IconButton>
          </Link>
        </div>
      ))}
      {withShowMore && hubs.length > 3 && (
        <IconButton
          variant="round"
          overrideStyle={styles.moreLessBtn}
          onClick={() => setShowMore(!showMore)}
        >
          {showMore ? "Show Less" : "Show More"}
        </IconButton>
      )}
    </div>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    fontSize: 14,
    display: "flex",
    columnGap: "7px",
    rowGap: "10px",
    flexWrap: "wrap",
  },
  hubBtn: {
    border: 0,
    background: colors.NEW_BLUE(0.1),
    padding: "4px 12px",
    height: "unset",
    textDecoration: "none",
    fontWeight: 400,
    color: colors.NEW_BLUE(),
  },
  moreLessBtn: {
    padding: "4px 12px",
    height: "unset",
    border: 0,
  },
});

export default DocumentHubs;
