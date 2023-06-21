import { StyleSheet, css } from "aphrodite";
import { useEffect, useRef, useState } from "react";
import {
  Comment as CommentModel,
  parseComment,
  CommentWithRange,
  RenderedInlineComment,
} from "./lib/types";
import { fetchInlineCommentsAPI } from "./lib/api";
import { GenericDocument } from "../Document/lib/types";
import XRange from "./lib/xrange/XRange";
import { isEmpty } from "~/config/utils/nullchecks";
import Comment from "./Comment";
import colors from "./lib/colors";
import drawHighlightsOnCanvas from "./lib/drawHighlightsOnCanvas";

interface Props {
  relativeRef: any; // Canvas will be rendered relative to this element
  document: GenericDocument;
}

const InlineCommentCanvas = ({ relativeRef, document }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [inlineComments, setInlineComments] = useState<CommentModel[]>([]);
  const [renderedComments, setRenderedComments] = useState<
    RenderedInlineComment[]
  >([]);
  const [canvasDimensions, setCanvasDimensions] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });
  const [selectedInlineComment, setSelectedInlineComment] =
    useState<RenderedInlineComment | null>(null);

  useEffect(() => {
    const _fetch = async () => {
      const { comments: rawComments } = await fetchInlineCommentsAPI({
        documentId: document.id,
        documentType: document.apiDocumentType,
      });
      const comments = rawComments.map((raw) => parseComment({ raw }));
      setInlineComments(comments);
    };

    _fetch();
  }, []);

  const _drawHighlights = () => {
    const commentsWithRanges = inlineComments
      .map((comment): CommentWithRange => {
        const _xrange =
          XRange.createFromSerialized(comment.anchor?.position) || null;
        return { comment: { ...comment }, xrange: _xrange };
      })
      .filter((c) => !isEmpty(c.xrange));

    drawHighlightsOnCanvas({
      commentsWithRange: commentsWithRanges,
      canvasRef,
      onRender: setRenderedComments,
    });
  };

  useEffect(() => {
    if (
      inlineComments.length > 0 &&
      canvasDimensions.width > 0 &&
      canvasDimensions.height > 0
    ) {
      _drawHighlights();
    }
  }, [canvasDimensions, inlineComments]);

  // The canvas element has no pointer-events because we want the user to be able to select text
  // in the content layer beneath. As a result, we can't detect click events on the canvas so
  // we need to detect click events on the content layer and compare to the canvas highlight coordinates to
  // see if there is a match.
  useEffect(() => {
    const handleCanvasClick = (event) => {
      const rect = canvasRef!.current!.getBoundingClientRect();
      const clickedX = event.clientX - rect.left;
      const clickedY = event.clientY - rect.top;

      for (let i = 0; i < renderedComments.length; i++) {
        const highlight = renderedComments[i];

        const isClickWithinHighlight = highlight.anchorCoordinates.some(
          ({ x, y, width, height }) => {
            return (
              clickedX >= x &&
              clickedX <= x + width &&
              clickedY >= y &&
              clickedY <= y + height
            );
          }
        );

        if (isClickWithinHighlight) {
          setSelectedInlineComment(renderedComments[i]);
        }
      }
    };

    const contentEl = relativeRef.current;
    const canvasEl = canvasRef.current;
    if (contentEl && canvasEl) {
      contentEl.addEventListener("click", handleCanvasClick);
    }

    return () => {
      if (contentEl && canvasEl) {
        contentEl.removeEventListener("click", handleCanvasClick);
      }
    };
  }, [relativeRef, canvasRef, renderedComments]);

  // Observe content dimension changes (relativeEl) so that we can resize the canvas accordingly
  // and redraw the highlights in the correct position.
  useEffect(() => {
    if (canvasRef.current && relativeRef.current) {
      const observer = new ResizeObserver(() => {
        canvasRef!.current!.width = relativeRef.current.offsetWidth;
        canvasRef!.current!.height = relativeRef.current.offsetHeight;
        setCanvasDimensions({
          width: canvasRef!.current!.width,
          height: canvasRef!.current!.height,
        });
      });

      observer.observe(relativeRef.current);

      return () => observer.disconnect();
    }
  }, [relativeRef, canvasRef]);

  return (
    <div>
      {renderedComments.length > 0 && (
        <div
          className={css(styles.commentSidebar)}
          style={{ position: "absolute", right: -510, top: 0, width: 500 }}
        >
          {renderedComments.map((_rc) => (
            <div
              style={{
                position: "absolute",
                background: "white",
                padding: 10,
                border: `1px solid ${colors.border}`,
                left: _rc.commentCoordinates.x,
                top: _rc.commentCoordinates.y,
              }}
              key={_rc.comment.id}
            >
              <Comment document={document} comment={_rc.comment} />
            </div>
          ))}
        </div>
      )}
      <canvas ref={canvasRef} id="overlay" className={css(styles.canvas)} />
    </div>
  );
};

const styles = StyleSheet.create({
  canvas: {
    pointerEvents: "none",
    position: "absolute",
    top: 0,
    left: 0,
  },
  commentSidebar: {},
});

export default InlineCommentCanvas;
