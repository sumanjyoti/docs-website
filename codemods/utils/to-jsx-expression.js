const {
  mdxAttribute,
  mdxImport,
  mdxSpanElement,
  mdxSpanExpression,
  mdxValueExpression,
} = require('./mdxast-builder');
const { camelCase } = require('lodash');
const path = require('path');

const { isPlainText } = require('./mdxast');
const { root, text } = require('mdast-builder');
const stringify = require('./mdxast-stringify');

const toJSXExpression = (node, file, tree) => {
  const children = transformChildren(node, file, tree);
  const attributeNode = root(
    children.length === 1 ? children : [mdxSpanElement(null, [], children)]
  );
  const expression = stringify(attributeNode).trim();

  return isPlainText(attributeNode)
    ? expression
    : mdxValueExpression(expression);
};

const transformChildren = (node, file, tree) => {
  return node.children
    .flatMap((child) => {
      const transformer = TRANSFORMERS[child.type];

      if (!transformer) {
        file.message(
          `Converting to JSX expression of unknown type: '${child.type}'`,
          child.position.start,
          'clamshells'
        );
        return;
      }

      return transformer(child, file, tree);
    })
    .filter(Boolean);
};

const escape = (str) => {
  return str.indexOf('{') === -1
    ? text(str)
    : // this implementation assumes that text with an opening '{' have a
      // matching closing '}'. MDX v2 currently fails to parse '{' in a string
      // without a closing '}', so we'll need to handle this differently if we
      // end up having cases where the text contents only include an opening '{'
      // https://github.com/mdx-js/mdx/issues/1081
      mdxSpanExpression(`'${str.replace("'", "\\'")}'`);
};

const TRANSFORMERS = {
  paragraph: transformChildren,
  inlineCode: (node) => mdxSpanElement('InlineCode', [], [escape(node.value)]),
  text: (node) => node,
  strong: (node, file) =>
    mdxSpanElement('strong', [], transformChildren(node, file)),
  link: (node, file) => {
    const isExternal = node.url.startsWith('http');

    return mdxSpanElement(
      isExternal ? 'ExternalLink' : 'Link',
      [mdxAttribute(isExternal ? 'href' : 'to', node.url)],
      transformChildren(node, file)
    );
  },
  break: () => mdxSpanElement('br'),
  image: (node, _file, tree) => {
    const isRelativeImport = Boolean(node.url.match(/^\.\.?\//));
    const importName = camelCase(
      path.basename(node.url, path.extname(node.url))
    );

    if (isRelativeImport) {
      tree.children.splice(1, 0, mdxImport(importName, node.url));
    }

    return mdxSpanElement(
      'img',
      [
        mdxAttribute(
          'src',
          isRelativeImport ? mdxValueExpression(importName) : node.url
        ),
        node.title && mdxAttribute('title', node.title),
        node.alt && mdxAttribute('alt', node.alt),
      ].filter(Boolean)
    );
  },
  mdxSpanElement: (node) => node,
  mdxBlockElement: (node) => node,
};

module.exports = toJSXExpression;
