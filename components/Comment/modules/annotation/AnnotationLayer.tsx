import { StyleSheet, css } from "aphrodite";
import React, { createRef, useEffect, useRef, useState } from "react";
import {
  Comment as CommentModel,
  CommentThreadGroup,
  parseComment,
  COMMENT_FILTERS,
  COMMENT_TYPES,
  COMMENT_CONTEXTS,
  groupByThread,
} from "../../lib/types";
import {
  Annotation as AnnotationType,
  SerializedAnchorPosition,
} from "./lib/types";
import { createCommentAPI, fetchCommentsAPI } from "../../lib/api";
import { GenericDocument } from "../../../Document/lib/types";
import XRange from "./lib/xrange/XRange";
import colors from "../../lib/colors";
import TextSelectionMenu from "../../TextSelectionMenu";
import useSelection, {
  Selection,
} from "~/components/Comment/modules/annotation/lib/useSelection";
import config from "../../lib/config";
import CommentEditor from "../../CommentEditor";
import { captureEvent } from "~/config/utils/events";
import { CommentTreeContext } from "../../lib/contexts";
import { sortOpts } from "../../lib/options";
import AnnotationCommentThread from "./AnnotationCommentThread";
import Annotation from "./Annotation";
import repositionAnnotations from "./lib/repositionAnnotations";
import createShareableLink from "./lib/createShareableLink";
import XPathUtil from "./lib/xrange/XPathUtil";
import CommentDrawer from "../../CommentDrawer";
import { breakpoints } from "~/config/themes/screen";
import debounce from "lodash/debounce";
import { useDispatch, useSelector } from "react-redux";
import { MessageActions } from "~/redux/message";
import CommentAvatars from "../../CommentAvatars";
import flattenComments from "../../lib/flattenComments";
import removeComment from "../../lib/removeComment";
import replaceComment from "../../lib/replaceComment";
import findComment from "../../lib/findComment";
import { isEmpty, localWarn } from "~/config/utils/nullchecks";
import { RHUser, parseUser } from "~/config/types/root_types";
import { RootState } from "~/redux";
import { set } from "react-ga";
import ContentSupportModal from "~/components/Modals/ContentSupportModal";
import { Purchase } from "~/config/types/purchase";
import {
  annotationToSerializedAnchorPosition,
  createAnnotation,
  selectionToSerializedAnchorPosition,
  urlSelectionToAnnotation,
} from "./lib/selection";
const { setMessage, showMessage } = MessageActions;

interface Props {
  contentRef: any;
  document: GenericDocument;
  pagesRendered: number; // The number of pages rendered so far
  displayPreference: "all" | "mine" | "none";
}

const AnnotationLayer = ({
  contentRef,
  document: doc,
  displayPreference,
  pagesRendered = 0,
}: Props) => {
  const [inlineComments, setInlineComments] = useState<CommentModel[]>([]);

  // Sorted List of annotations sorted by order of appearance on the page
  const [annotationsSortedByY, setAnnotationsSortedByY] = useState<
    AnnotationType[]
  >([]);
  const annotationsSortedByYRef = useRef<AnnotationType[]>([]);

  // Orphans are annotations that could not be found on page
  const [orphanThreadIds, setOrphanThreadIds] = useState<string[]>([]);

  // Setting this to true will redraw the annotations on the page.
  const [needsRedraw, setNeedsRedraw] = useState<
    { drawMode: "DIFF_ONLY" | "ALL" } | false
  >(false);

  const selection = useSelection({
    contentRef: contentRef,
  });

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);

  // Holds information about a particular annotation that is shared via URL
  const [positionFromUrl, setPositionFromUrl] = useState<AnnotationType | null>(
    null
  );

  const [threadRefs, setThreadRefs] = useState<any[]>([]);
  const commentThreads = useRef<{ [threadId: string]: CommentThreadGroup }>({});
  const textSelectionMenuRef = useRef<HTMLDivElement>(null);
  const windowDimensions = useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Xpath to the content element provided. This is used to calculated a relative xpath of selected text within the element.
  const contentElXpath = useRef<string>("");
  const dispatch = useDispatch();
  const currentUser = useSelector((state: RootState) =>
    isEmpty(state.auth?.user) ? null : parseUser(state.auth.user)
  );

  // Fetch comments from API
  useEffect(() => {
    const _fetch = async () => {
      const { comments: rawComments } = await fetchCommentsAPI({
        documentId: doc.id,
        filter: COMMENT_FILTERS.ANNOTATION,
        sort: "CREATED_DATE",
        ascending: true,
        documentType: doc.apiDocumentType,
        // For annotations, we want a very large page size because there is no "load more" UI button
        childPageSize: 10000,
        pageSize: 10000,
      });
      const comments = rawComments.map((raw) => parseComment({ raw }));
      setInlineComments(comments);
    };

    _setWindowDimensions();
    _fetch();
  }, []);

  // Once we have comments, we want to group them by threads and draw them on the page
  useEffect(() => {
    if (inlineComments.length === 0) return;

    const _comments = inlineComments.filter((comment) => {
      if (displayPreference === "all" || !displayPreference) return true;
      if (displayPreference === "mine") {
        return comment.createdBy.id === currentUser?.id;
      }
      return false;
    });

    const _commentThreads = groupByThread(_comments);
    commentThreads.current = _commentThreads;

    setNeedsRedraw({ drawMode: "DIFF_ONLY" });
  }, [inlineComments, displayPreference, pagesRendered]);

  useEffect(() => {
    if (needsRedraw) {
      const readyThreads = getThreadsReadyForRender({
        threads: commentThreads.current,
        pagesRendered,
      });
      console.log("pagesRendered", pagesRendered, "readyThreads", readyThreads);

      const { orphanThreadIds, foundAnnotations } = _drawAnnotations({
        annotationsSortedByY,
        threads: readyThreads,
        drawingMode: needsRedraw?.drawMode,
      });

      setNeedsRedraw(false);
      setOrphanThreadIds(orphanThreadIds);
      _setAnnotations(foundAnnotations);

      const repositioned = repositionAnnotations({
        annotationsSortedByY: annotationsSortedByYRef.current,
        selectedThreadId,
        threadRefs,
      });

      const updated = _replaceAnnotations({
        existing: annotationsSortedByYRef.current,
        replaceWith: repositioned,
      });

      setAnnotationsSortedByY(updated);
    }
  }, [needsRedraw]);

  // Gets xpath to the contentEl. Later, we will use this to retrieve a relative xpath to the selected text.
  // instead of an absolute path.
  useEffect(() => {
    if (contentRef.current) {
      contentElXpath.current =
        XPathUtil.getXPathFromNode(contentRef.current) || "";
    }
  }, [contentRef]);

  // Observe dimension changes for each of the threads.
  // If position has changed, recalculate.
  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      const repositioned = repositionAnnotations({
        annotationsSortedByY: annotationsSortedByYRef.current,
        selectedThreadId,
        threadRefs,
      });

      const updated = _replaceAnnotations({
        existing: annotationsSortedByYRef.current,
        replaceWith: repositioned,
      });

      _setAnnotations(updated);
    });

    threadRefs.forEach((t) => {
      if (t.current) {
        resizeObserver.observe(t.current);
      }
    });

    return () => {
      threadRefs.forEach((t) => {
        if (t.current) {
          resizeObserver.unobserve(t.current);
        }
      });
    };
  }, [threadRefs, selectedThreadId]);

  // Create a sorted list of threads that maps to sorted list of annotations
  // threadRefs[i] will always map to annotationsSortedByY[i] and vice versa
  useEffect(() => {
    setThreadRefs((refs) =>
      Array(annotationsSortedByY.length)
        .fill(null)
        .map((_, i) => refs[i] || createRef())
    );
  }, [annotationsSortedByY.length]);

  // Move things around when a particular annotation is selected.
  useEffect(() => {
    const repositioned = repositionAnnotations({
      annotationsSortedByY: annotationsSortedByY,
      selectedThreadId,
      threadRefs,
    });

    const updated = _replaceAnnotations({
      existing: annotationsSortedByY,
      replaceWith: repositioned,
    });

    _setAnnotations(updated);

    if (selectedThreadId && renderingMode === "sidebar") {
      const selectedAnnotation = annotationsSortedByY.find(
        (annotation, idx) => annotation.threadId === selectedThreadId
      );

      if (selectedAnnotation) {
        const relativeElOffsetTop =
          window.scrollY + contentRef.current.getBoundingClientRect().y;
        const anchorOffsetTop =
          relativeElOffsetTop + selectedAnnotation.anchorCoordinates[0].y;

        if (
          window.scrollY > anchorOffsetTop ||
          window.scrollY + window.innerHeight < anchorOffsetTop
        ) {
          window.scrollTo({
            top: anchorOffsetTop - 100,
            behavior: "smooth",
          });
        }
      }
    }
  }, [selectedThreadId]);

  // When a resize happens, we want to how to render annotations. i.e. drawer, sidebar, inline
  useEffect(() => {
    if (!contentRef.current) return;

    const _handleResize = debounce(() => {
      setNeedsRedraw({ drawMode: "ALL" });
      _setWindowDimensions();
    }, 1000);

    window.addEventListener("resize", _handleResize);

    return () => {
      _handleResize.cancel();
      window.removeEventListener("resize", _handleResize);
    };
  }, [contentRef, annotationsSortedByY]);

  useEffect(() => {
    const _handleResize = debounce(() => {
      setNeedsRedraw({ drawMode: "ALL" });
    }, 1000);

    const resizeObserver = new ResizeObserver((entries) => {
      _handleResize();
    });

    if (contentRef.current) {
      resizeObserver.observe(contentRef.current);
    }

    return () => {
      if (contentRef.current) {
        resizeObserver.unobserve(contentRef.current);
      }
    };
  }, [contentRef]);

  // Handle click event.
  // Since click events happen in a canvas, we need to detect a user's click x,y coordinates and determine
  // what elment was clicked.
  useEffect(() => {
    const _handleClick = (event) => {
      if (selection.xrange || !window.getSelection()?.isCollapsed) {
        return;
      }

      const contentRefRect = contentRef!.current!.getBoundingClientRect();
      const relativeClickX = event.clientX - contentRefRect.left;
      const relativeClickY = event.clientY - contentRefRect.top;
      const clickX = event.clientX;
      const clickY = event.clientY;
      let selectedAnnotation: AnnotationType | null = null;

      for (let i = 0; i < annotationsSortedByY.length; i++) {
        const { anchorCoordinates } = annotationsSortedByY[i];
        const isAnchorClicked = anchorCoordinates.some(
          ({ x, y, width, height }) => {
            return (
              relativeClickX >= x &&
              relativeClickX <= x + width &&
              relativeClickY >= y &&
              relativeClickY >= y &&
              relativeClickY <= y + height
            );
          }
        );

        if (isAnchorClicked) {
          selectedAnnotation = annotationsSortedByY[i];
          continue;
        }
      }

      if (!selectedAnnotation) {
        for (let i = 0; i < annotationsSortedByY.length; i++) {
          const ref = threadRefs[i]?.current;

          if (ref) {
            const rect = ref.getBoundingClientRect();
            if (
              clickX >= rect.left &&
              clickX <= rect.right &&
              clickY >= rect.top &&
              clickY <= rect.bottom
            ) {
              selectedAnnotation = annotationsSortedByY[i];
              continue;
            }
          }
        }
      }

      if (selectedAnnotation) {
        setSelectedThreadId(selectedAnnotation.threadId);
      } else {
        setSelectedThreadId(null);
      }

      if (positionFromUrl) {
        setPositionFromUrl(null);
      }
    };

    document.addEventListener("click", _handleClick);

    return () => {
      document.removeEventListener("click", _handleClick);
    };
  }, [annotationsSortedByY, positionFromUrl, selection.xrange]);

  // If a serialized position to an annotation is shared via the URL, we want to unserialize it and scroll
  // the user to its position.
  useEffect(() => {
    if (contentRef.current && window.location.hash.length > 0) {
      const hashPairs = window.location.hash.split("&");
      const selectionIdx = hashPairs.findIndex((pair) =>
        pair.includes("selection")
      );

      if (selectionIdx > -1) {
        let MAX_ATTEMPTS_REMAINING = 5; // Since the page is in transition, we want to retry x number of times
        const interval = setInterval(() => {
          if (MAX_ATTEMPTS_REMAINING === 0) {
            clearInterval(interval);
            return;
          }

          try {
            const [key, value] = hashPairs[selectionIdx].split("=");
            const annotation = urlSelectionToAnnotation({
              urlSelection: value,
              ignoreXPathPrefix: contentElXpath.current,
              relativeEl: contentRef.current,
            });

            setPositionFromUrl(annotation);
            clearInterval(interval);
            _scrollToAnnotation({ annotation });
          } catch (error) {}

          MAX_ATTEMPTS_REMAINING--;
        }, 1000);
      }
    }
  }, [contentRef]);

  const _scrollToAnnotation = ({
    annotation,
  }: {
    annotation: AnnotationType;
  }) => {
    if (annotation) {
      const relativeElOffsetTop =
        window.scrollY + contentRef.current.getBoundingClientRect().y;
      const anchorOffsetTop =
        relativeElOffsetTop + annotation.anchorCoordinates[0].y;

      window.scrollTo({
        top: anchorOffsetTop - 100,
        behavior: "smooth",
      });
    }
  };

  const _replaceAnnotations = ({
    existing,
    replaceWith,
  }: {
    existing: AnnotationType[];
    replaceWith: AnnotationType[];
  }) => {
    const newAnnotationsSortedByY = [...existing];
    for (let i = 0; i < newAnnotationsSortedByY.length; i++) {
      const annotation = newAnnotationsSortedByY[i];
      const repositionedAnnotation: AnnotationType | undefined =
        replaceWith.find(
          (_annotation) => annotation.threadId === _annotation.threadId
        );

      if (repositionedAnnotation) {
        newAnnotationsSortedByY[i] = repositionedAnnotation;
      }
    }

    return newAnnotationsSortedByY;
  };

  const _sortAnnotationsByAppearanceInPage = (
    annotations: AnnotationType[]
  ): AnnotationType[] => {
    const sorted = annotations.sort((a, b) => {
      const aY = a.anchorCoordinates[a.anchorCoordinates.length - 1].y;
      const bY = b.anchorCoordinates[b.anchorCoordinates.length - 1].y;
      return aY - bY;
    });

    return sorted;
  };

  const _setWindowDimensions = () => {
    windowDimensions.current = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  };

  const _drawAnnotations = ({
    threads,
    annotationsSortedByY,
    drawingMode = "DIFF_ONLY",
  }: {
    threads: { [key: string]: CommentThreadGroup };
    annotationsSortedByY: AnnotationType[];
    // If the page changes size, chances are xrange would need to be recalculated. In that case, we need ALL
    drawingMode?: "DIFF_ONLY" | "ALL";
  }): {
    orphanThreadIds: Array<string>;
    foundAnnotations: Array<AnnotationType>;
  } => {
    console.log("%cDrawing anchors...", "color: #F3A113; font-weight: bold;");

    const orphanThreadIds: Array<string> = [];
    const foundAnnotations: Array<AnnotationType> = [];

    Object.values(threads).forEach((threadGroup) => {
      const existingAnnotation = annotationsSortedByY.find(
        (annotation) => annotation.threadId === threadGroup.threadId
      );

      if (existingAnnotation && drawingMode === "DIFF_ONLY") {
        foundAnnotations.push(existingAnnotation);
      } else {
        const xrange = XRange.createFromSerialized({
          serialized: threadGroup.thread.anchor,
          xpathPrefix: contentElXpath.current,
        });

        if (xrange) {
          const annotation = createAnnotation({
            xrange,
            threadId: threadGroup.threadId,
            relativeEl: contentRef.current,
            serializedAnchorPosition: threadGroup.thread!
              .anchor as SerializedAnchorPosition,
          });

          foundAnnotations.push(annotation);
        } else {
          console.log(
            "[Annotation] No xrange found for thread. Orphan thread is:",
            threadGroup.thread
          );
          orphanThreadIds.push(threadGroup.threadId);
        }
      }
    });

    const foundAndSorted = _sortAnnotationsByAppearanceInPage(foundAnnotations);
    return { orphanThreadIds, foundAnnotations: foundAndSorted };
  };

  const _createNewAnnotation = ({
    event,
    selection,
    ignoreXPathPrefix,
  }: {
    event: any;
    selection: Selection;
    ignoreXPathPrefix: string;
  }) => {
    event.stopPropagation();

    if (selection.error) {
      dispatch(setMessage(selection.error));
      // @ts-ignore
      dispatch(showMessage({ show: true, error: true }));
      return;
    }

    if (!selection.xrange) {
      return console.error("No selected range. This should not happen.");
    }

    const selectedText = selection.xrange.textContent();
    if (selectedText.length > config.annotation.maxSelectionChars) {
      dispatch(
        setMessage(
          `Selected text is too long. Select text less than ${config.annotation.maxSelectionChars} characters long.`
        )
      );
      // @ts-ignore
      dispatch(showMessage({ show: true, error: true }));
      return;
    }

    const newAnnotation = createAnnotation({
      serializedAnchorPosition: selectionToSerializedAnchorPosition({
        selection,
        ignoreXPathPrefix,
      }),
      relativeEl: contentRef.current,
      isNew: true,
      xrange: selection.xrange,
    });

    const _annotationsSortedByY = _sortAnnotationsByAppearanceInPage([
      ...annotationsSortedByY,
      newAnnotation,
    ]);
    setSelectedThreadId(newAnnotation.threadId);
    selection.resetSelectedPos();
    _setAnnotations(_annotationsSortedByY);
  };

  const _setAnnotations = (annotations: AnnotationType[]) => {
    annotationsSortedByYRef.current = annotations;
    setAnnotationsSortedByY(annotations);
  };

  const _handleCancelThread = ({ threadId, event }) => {
    const updated = annotationsSortedByY.filter(
      (annotation) => annotation.threadId !== threadId
    );

    _setAnnotations(updated);
  };

  const _handleCreateThread = async ({
    annotation,
    commentProps,
  }: {
    annotation: AnnotationType;
    commentProps: any;
  }) => {
    try {
      const serialized = annotationToSerializedAnchorPosition({
        annotation,
        // IMPORTANT: We always want to get a fresh xpath to the container contentEl right before serializing
        // because DOM changes (i.e. full screen mode) can cause the xpath of it to change.
        ignoreXPathPrefix: XPathUtil.getXPathFromNode(contentRef.current) || "",
      });

      const comment = await createCommentAPI({
        ...commentProps,
        documentId: doc.id,
        documentType: doc.apiDocumentType,
        commentType: COMMENT_TYPES.ANNOTATION,
        anchor: {
          type: "text",
          position: serialized,
        },
      });

      _onCreate({ comment });
    } catch (error) {
      captureEvent({
        msg: "Failed to create inline comment",
        data: {
          document,
          error,
          annotation,
        },
      });
    }
  };

  const _onCreate = ({
    comment,
    parent,
  }: {
    comment: CommentModel;
    parent?: CommentModel;
  }) => {
    if (parent) {
      parent.children = [...parent.children, comment];

      replaceComment({
        prev: parent,
        next: parent,
        list: inlineComments,
      });

      setInlineComments([...inlineComments]);
    } else {
      setInlineComments([...inlineComments, comment]);
    }
  };

  const _onRemove = ({ comment }: { comment: CommentModel }) => {
    const found = findComment({ id: comment.id, comments: inlineComments });
    if (found) {
      removeComment({
        comment: found.comment,
        list: inlineComments,
      });

      setInlineComments([...inlineComments]);
    } else {
      localWarn(
        `Comment ${comment.id} could was expected to be found in tree but was not. This is likely an error`
      );
    }
  };

  const _onUpdate = ({ comment }: { comment: CommentModel }) => {
    const found = findComment({ id: comment.id, comments: inlineComments });
    if (found) {
      replaceComment({
        prev: found.comment,
        next: comment,
        list: inlineComments,
      });
      setInlineComments([...inlineComments]);
    } else {
      localWarn(
        `Comment ${comment.id} could was expected to be found in tree but was not. This is likely an error`
      );
    }
  };

  const _onSupport = (data: any) => {
    const found = findComment({ id: data.object_id, comments: inlineComments });
    if (found) {
      const updatedComment = { ...found.comment };
      const tip: Purchase = {
        amount: data.amount,
        // @ts-ignore
        createdBy: currentUser,
      };
      updatedComment.tips.push(tip);
      _onUpdate({ comment: updatedComment });
    }
  };

  const getRenderingMode = ({
    contentRef,
  }: {
    contentRef: any;
  }): "inline" | "drawer" | "sidebar" => {
    if (!contentRef.current) return "sidebar";

    const rect = contentRef.current.getBoundingClientRect();
    const rightMarginWidth = window.innerWidth - (rect.x + rect.width);
    const sidebarWidth =
      config.annotation.sidebarCommentWidth + config.annotation.sidebarBuffer;

    if (rightMarginWidth >= sidebarWidth) {
      return "sidebar";
    } else if (
      rightMarginWidth < sidebarWidth &&
      window.innerWidth >= breakpoints.xsmall.int
    ) {
      return "inline";
    } else {
      return "drawer";
    }
  };

  const getThreadsReadyForRender = ({
    threads,
    pagesRendered,
  }: {
    threads: { [key: string]: CommentThreadGroup };
    pagesRendered: number;
  }): { [key: string]: CommentThreadGroup } => {
    const readyThreads = {};
    Object.keys(threads).forEach((threadId) => {
      const threadGroup = threads[threadId];
      if ((threadGroup?.thread?.anchor?.pageNumber || 0) <= pagesRendered) {
        readyThreads[threadId] = threadGroup;
      }
    });
    return readyThreads;
  };

  const _calcTextSelectionMenuPos = ({
    selectionMouseCoordinates,
    renderingMode,
    initialSelectionPosition,
  }) => {
    if (!contentRef.current)
      return { right: "unset", left: "unset", top: "unset" };

    if (renderingMode === "sidebar") {
      const containerElemOffset =
        window.scrollY + contentRef.current.getBoundingClientRect().y;
      return {
        right: 0 - config.textSelectionMenu.width / 2,
        top:
          window.scrollY -
          containerElemOffset +
          (initialSelectionPosition?.y || 0),
        left: "unset",
      };
    } else {
      return {
        right: "unset",
        top: selectionMouseCoordinates?.y || 0,
        left: selectionMouseCoordinates?.x || 0,
      };
    }
  };

  const showSelectionMenu =
    selection.xrange && selection.initialSelectionPosition;
  const renderingMode = getRenderingMode({ contentRef });
  const contentElOffset = contentRef.current?.getBoundingClientRect()?.x;
  const WrapperEl = renderingMode === "drawer" ? CommentDrawer : React.Fragment;
  const {
    left: menuPosLeft,
    top: menuPosTop,
    right: menuPosRight,
  } = _calcTextSelectionMenuPos({
    selectionMouseCoordinates: selection.mouseCoordinates,
    initialSelectionPosition: selection.initialSelectionPosition,
    renderingMode,
  });

  return (
    <div style={{ position: "relative", zIndex: 1 }}>
      <ContentSupportModal
        // @ts-ignore
        onSupport={(data: any) => {
          _onSupport(data);
        }}
      />

      {annotationsSortedByY.map((annotation) => (
        <Annotation
          key={`annotation-${annotation.threadId}`}
          annotation={annotation}
          focused={
            selectedThreadId === annotation.threadId ||
            hoveredThreadId === annotation.threadId
          }
        />
      ))}
      {positionFromUrl && (
        <Annotation
          annotation={positionFromUrl}
          focused={true}
          color={colors.annotation.sharedViaUrl}
        />
      )}
      <CommentTreeContext.Provider
        value={{
          sort: sortOpts[0].value,
          filter: COMMENT_FILTERS.ANNOTATION,
          comments: inlineComments,
          context: COMMENT_CONTEXTS.ANNOTATION,
          onCreate: _onCreate,
          onUpdate: _onUpdate,
          onRemove: _onRemove,
          onFetchMore: () => null, // Not applicable in this context
        }}
      >
        {showSelectionMenu && (
          <div
            id="textSelectionMenu"
            style={{
              position: "absolute",
              top: menuPosTop,
              left: menuPosLeft,
              right: menuPosRight,
              width: 50,
              zIndex: 5,
            }}
            ref={textSelectionMenuRef}
          >
            <TextSelectionMenu
              isHorizontal={renderingMode !== "sidebar"}
              onCommentClick={(event) =>
                _createNewAnnotation({
                  event,
                  selection,
                  ignoreXPathPrefix: contentElXpath.current,
                })
              }
              onLinkClick={() =>
                createShareableLink({
                  selectionXRange: selection.xrange,
                  contentElXpath: contentElXpath.current,
                })
              }
            />
          </div>
        )}

        {/* @ts-ignore */}
        <WrapperEl
          {...(renderingMode === "drawer"
            ? { isOpen: Boolean(selectedThreadId) }
            : {})}
          {...(renderingMode === "drawer"
            ? { handleClose: () => setSelectedThreadId(null) }
            : {})}
        >
          {renderingMode === "inline" && (
            <div className={css(styles.avatarsContainer)}>
              {annotationsSortedByY.map((annotation, idx) => {
                const threadId = String(annotation.threadId);
                const avatarPosition = `translate(-25px, ${annotation.anchorCoordinates[0].y}px)`;
                const isFocused = threadId === selectedThreadId;
                const thread = commentThreads?.current[threadId];
                let commentPeople: RHUser[] = [];
                if (thread) {
                  const { comments: flatComments } = flattenComments(
                    thread.comments
                  );
                  commentPeople = flatComments.map((c) => c.createdBy);
                }

                return (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedThreadId(threadId);
                    }}
                    key={`avatar-for-` + threadId}
                    style={{
                      transform: avatarPosition,
                      display: isFocused ? "none" : "block",
                    }}
                  >
                    <div
                      className={css(styles.avatarWrapper)}
                      onMouseEnter={() => setHoveredThreadId(threadId)}
                      onMouseLeave={() => setHoveredThreadId(null)}
                    >
                      <CommentAvatars
                        people={commentPeople}
                        withTooltip={false}
                        spacing={-20}
                        size={25}
                        maxPeople={2}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div
            className={css(
              styles.commentsContainer,
              renderingMode === "sidebar" && styles.sidebarContainer,
              renderingMode === "inline" && styles.inlineContainer,
              renderingMode === "drawer" && styles.drawerContainer
            )}
          >
            {annotationsSortedByY.map((annotation, idx) => {
              const threadId = String(annotation.threadId);
              const key = `thread-` + threadId;
              const isFocused = selectedThreadId === threadId;

              let threadPosition = "";
              if (renderingMode === "inline") {
                const inlineCommentPos = {
                  x: annotation.anchorCoordinates[0].x,
                  y: annotation.anchorCoordinates[0].y + 25,
                };
                if (isFocused) {
                  const inlineCommentRightPos =
                    contentElOffset +
                    annotation.anchorCoordinates[0].x +
                    config.annotation.inlineCommentWidth;
                  if (inlineCommentRightPos > windowDimensions.current.width) {
                    inlineCommentPos.x =
                      inlineCommentPos.x -
                      (inlineCommentRightPos - windowDimensions.current.width) -
                      10;
                  }
                }

                threadPosition = `translate(${inlineCommentPos.x}px, ${inlineCommentPos.y}px)`;
              } else if (renderingMode === "sidebar") {
                threadPosition = `translate(${annotation.threadCoordinates.x}px, ${annotation.threadCoordinates.y}px)`;
              }

              const isThreadVisible =
                (renderingMode === "inline" && isFocused) ||
                (renderingMode === "drawer" && isFocused) ||
                renderingMode === "sidebar";

              return (
                <div
                  id={key}
                  ref={threadRefs[idx]}
                  style={{
                    display: isThreadVisible ? "block" : "none",
                    transform: threadPosition,
                  }}
                  className={css(
                    styles.commentThread,
                    isFocused && styles.focusedCommentThread,
                    renderingMode === "sidebar" && styles.sidebarComment,
                    renderingMode === "inline" && styles.inlineComment,
                    renderingMode === "drawer" && styles.drawerComment
                  )}
                  onMouseEnter={() => setHoveredThreadId(threadId)}
                  onMouseLeave={() => setHoveredThreadId(null)}
                  key={key}
                >
                  {annotation.isNew ? (
                    <div className={css(styles.commentEditorWrapper)}>
                      <CommentEditor
                        handleCancel={(event) =>
                          _handleCancelThread({ threadId, event })
                        }
                        editorStyleOverride={styles.commentEditor}
                        editorId={`${key}-editor`}
                        handleSubmit={(commentProps) =>
                          _handleCreateThread({ annotation, commentProps })
                        }
                      />
                    </div>
                  ) : (
                    <AnnotationCommentThread
                      key={`${key}-thread`}
                      document={doc}
                      renderingMode={renderingMode}
                      threadId={threadId}
                      onCancel={() => {
                        setSelectedThreadId(null);
                        setHoveredThreadId(null);
                      }}
                      rootComment={
                        commentThreads?.current[threadId]?.comments[0] || []
                      }
                      isFocused={isFocused}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </WrapperEl>
      </CommentTreeContext.Provider>
    </div>
  );
};

const styles = StyleSheet.create({
  commentsContainer: {},
  avatarsContainer: {
    position: "absolute",
    right: -15,

    [`@media (max-width: ${breakpoints.desktop.int}px)`]: {
      right: 10,
    },
  },
  sidebarContainer: {
    position: "absolute",
    right: -15,
  },
  focusedCommentThread: {
    boxShadow: "0px 0px 15px rgba(36, 31, 58, 0.2)",
    ":hover": {
      background: "white",
    },
  },
  inlineContainer: {},
  drawerContainer: {},
  sidebarComment: {
    width: config.annotation.sidebarCommentWidth,
    position: "absolute",
  },
  inlineComment: {
    width: config.annotation.inlineCommentWidth,
    position: "absolute",
  },
  drawerComment: {},
  commentThread: {
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
    cursor: "pointer",
    transition: "transform 0.4s ease",
    background: "white",
    boxSizing: "border-box",
    ":hover": {
      background: "rgb(250 248 248)",
    },
  },
  commentEditor: {
    boxShadow: "none",
    padding: 0,
  },
  commentEditorWrapper: {
    padding: 10,
  },
  avatarWrapper: {
    position: "absolute",
    background: "white",
    padding: 5,
    borderRadius: "50% 50% 50% 0%",
    boxShadow: "0px 0px 15px rgba(36, 31, 58, 0.2)",
    border: `1px solid white`,
    ":hover": {
      background: "#EDEDED",
      transition: "0.2s",
      border: `1px solid #999`,
    },
  },
});

export default AnnotationLayer;
