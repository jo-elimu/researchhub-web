import { StyleSheet, css } from "aphrodite";
import DocumentHeader from "../DocumentHeaderV2";
import config from "~/components/Document/lib/config";
import {
  DocumentMetadata,
  GenericDocument,
  isPaper,
  isPost,
} from "../lib/types";
import { LEFT_SIDEBAR_MIN_WIDTH } from "~/components/Home/sidebar/RootLeftSidebar";
import { breakpoints } from "~/config/themes/screen";
import removeMd from "remove-markdown";
import { truncateText } from "~/config/utils/string";
import buildOpenGraphData, { OpenGraphData } from "../lib/buildOpenGraphData";
import HeadComponent from "~/components/Head";
import { useRouter } from "next/router";
import { useState } from "react";

interface Args {
  document: GenericDocument;
  children?: any;
  metadata: DocumentMetadata;
  isExpanded?: boolean;
  noLineItems?: boolean;
  noHorizontalTabBar?: boolean;
  documentPageClass?: any;
  topAreaClass?: any;
  headerContentWrapperClass?: any;
  referenceManagerView?: boolean;
}

const toPlaintext = (text) => {
  return removeMd(text).replace(/&nbsp;/g, " ");
};

const DocumentPageLayout = ({
  document,
  metadata,
  children,
  noLineItems,
  noHorizontalTabBar,
  documentPageClass,
  topAreaClass,
  headerContentWrapperClass,
  referenceManagerView,
}: Args) => {
  const router = useRouter();
  let openGraphData: OpenGraphData = { meta: {}, graph: [] };
  try {
    openGraphData = buildOpenGraphData({
      document,
      description: isPost(document)
        ? truncateText(toPlaintext(document.postHtml), 200)
        : isPaper(document)
        ? truncateText(toPlaintext(document.abstract), 200)
        : "",
      url: router.asPath,
    });
  } catch (e) {
    console.log("Error building open graph data", e);
  }

  return (
    <div className={css(styles.pageWrapper) + " " + documentPageClass}>
      <HeadComponent {...openGraphData.meta} graph={openGraphData.graph}>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
      </HeadComponent>

      <div className={css(styles.topArea) + " " + topAreaClass}>
        <DocumentHeader
          document={document}
          metadata={metadata}
          noLineItems={noLineItems}
          noHorizontalTabBar={noHorizontalTabBar}
          headerContentWrapperClass={headerContentWrapperClass}
          referenceManagerView={referenceManagerView}
        />
      </div>
      <div className={css(styles.bodyArea)}>{children}</div>
    </div>
  );
};

const styles = StyleSheet.create({
  pageWrapper: {
    height: "100%",
    background: config.background,
    paddingBottom: 50,
    [`@media (max-width: ${config.width}px)`]: {
      maxWidth: `calc(100vw - ${LEFT_SIDEBAR_MIN_WIDTH}px)`,
    },
    [`@media (max-width: ${breakpoints.xsmall.str})`]: {
      maxWidth: `100vw`,
    },
  },
  topArea: {
    background: "white",
    position: "relative",
    zIndex: 4,
    paddingTop: 25,
  },
  bodyArea: {
    display: "block",
    marginTop: 25,
    [`@media (max-width: ${config.width}px)`]: {
      paddingLeft: 15,
      paddingRight: 15,
      boxSizing: "border-box",
    },
  },
});

export default DocumentPageLayout;
